import { FormEvent, useEffect, useMemo, useState } from "react";
import type { RideRecord, Settings } from "./types";
import {
  calculateRideEstimate,
  createRideRecord,
  DEFAULT_SETTINGS,
  formatNumber,
  formatPercent,
  formatWon,
  getAppStats,
  normalizeSettings,
} from "./utils/calculations";
import { loadRecords, loadSettings, saveRecords, saveSettings } from "./utils/storage";

type NumberField = keyof Settings;
type NumericSettingField = Exclude<NumberField, "fuelCostMode">;
type RecordSort = "recent" | "oldest";
type RecordPeriod = "month" | "week" | "day";

type DayGroup = {
  key: string;
  label: string;
  sortTime: number;
  records: RideRecord[];
  savings: number;
  fuelCost: number;
  distanceKm: number;
};

const settingsFields: Array<{
  key: NumericSettingField;
  label: string;
  suffix: string;
  step: string;
}> = [
  { key: "distanceKm", label: "기본 이동거리", suffix: "km", step: "0.1" },
  { key: "transitFare", label: "대중교통비", suffix: "원", step: "10" },
  { key: "monthlyRent", label: "월 렌트비", suffix: "원", step: "1000" },
];

const literFuelFields: Array<{
  key: NumericSettingField;
  label: string;
  suffix: string;
  step: string;
}> = [
  { key: "fuelEfficiencyKmPerL", label: "연비", suffix: "km/L", step: "0.1" },
  { key: "fuelPricePerL", label: "유가", suffix: "원/L", step: "10" },
];

const fillupFuelFields: Array<{
  key: NumericSettingField;
  label: string;
  suffix: string;
  step: string;
}> = [
  { key: "fillupAmount", label: "한 번 주유금액", suffix: "원", step: "1000" },
  { key: "fillupRangeKm", label: "그 주유로 타는 거리", suffix: "km", step: "1" },
];

const distancePresets = [1, 2, 3, 5];
const fillupAmountPresets = [40000, 50000];
const GROUPS_PER_PAGE = 5;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatPeriodDate = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);

const formatMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(date);

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const localDayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const weekStart = (date: Date) => {
  const start = localDayStart(date);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
};

const monthMeta = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    label: formatMonthLabel(start),
    sortTime: start.getTime(),
  };
};

const weekMeta = (date: Date) => {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return {
    key: `week-${dateKey(start)}`,
    label: `${formatPeriodDate(start)} - ${formatPeriodDate(end)}`,
    sortTime: start.getTime(),
  };
};

const dayMeta = (date: Date) => {
  const start = localDayStart(date);
  return {
    key: dateKey(start),
    label: formatPeriodDate(start),
    sortTime: start.getTime(),
  };
};

const periodMeta = (date: Date, period: RecordPeriod) => {
  if (period === "month") return monthMeta(date);
  if (period === "week") return weekMeta(date);
  return dayMeta(date);
};

const recoveryMessage = (rate: number) => {
  if (rate >= 100) return "이번 달은 렌트비 마음속 회수 완료";
  if (rate > 0) return "아직 초반전. 탈 때마다 조금씩 회수 중";
  return "첫 적립을 기다리는 중";
};

const App = () => {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [draftSettings, setDraftSettings] = useState<Settings>(() => loadSettings());
  const [records, setRecords] = useState<RideRecord[]>(() => loadRecords());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [feedback, setFeedback] = useState("대중교통 안 탄 값, 마음속 저금통에 저장");
  const [burstKey, setBurstKey] = useState(0);
  const [pendingReset, setPendingReset] = useState(false);
  const [recordPage, setRecordPage] = useState(1);
  const [recordSort, setRecordSort] = useState<RecordSort>("recent");
  const [recordPeriod, setRecordPeriod] = useState<RecordPeriod>("month");

  const estimate = useMemo(() => calculateRideEstimate(settings), [settings]);
  const stats = useMemo(() => getAppStats(records, settings), [records, settings]);
  const sortedRecords = useMemo(
    () =>
      [...records].sort((a, b) => {
        const left = Date.parse(a.createdAt);
        const right = Date.parse(b.createdAt);
        return recordSort === "recent" ? right - left : left - right;
    }),
    [recordSort, records],
  );
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, DayGroup>();

    for (const record of sortedRecords) {
      const meta = periodMeta(new Date(record.createdAt), recordPeriod);
      const group =
        groups.get(meta.key) ??
        ({
          key: meta.key,
          label: meta.label,
          sortTime: meta.sortTime,
          records: [],
          savings: 0,
          fuelCost: 0,
          distanceKm: 0,
        } satisfies DayGroup);

      group.records.push(record);
      group.savings += record.mentalSavings;
      group.fuelCost += record.fuelCost;
      group.distanceKm += record.distanceKm;
      groups.set(meta.key, group);
    }

    return Array.from(groups.values()).sort((a, b) =>
      recordSort === "recent" ? b.sortTime - a.sortTime : a.sortTime - b.sortTime,
    );
  }, [recordPeriod, recordSort, sortedRecords]);
  const recordPageCount = Math.max(1, Math.ceil(groupedRecords.length / GROUPS_PER_PAGE));
  const currentRecordPage = Math.min(recordPage, recordPageCount);
  const groupStart = (currentRecordPage - 1) * GROUPS_PER_PAGE;
  const visibleRecordGroups = useMemo(
    () => groupedRecords.slice(groupStart, groupStart + GROUPS_PER_PAGE),
    [groupStart, groupedRecords],
  );
  const fuelBasis =
    settings.fuelCostMode === "fillup"
      ? `${formatWon(settings.fillupAmount)} / ${formatNumber(settings.fillupRangeKm, 0)}km`
      : `${formatNumber(settings.fuelEfficiencyKmPerL, 1)}km/L · ${formatWon(
          settings.fuelPricePerL,
        )}/L`;

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    setRecordPage((current) => Math.min(current, recordPageCount));
  }, [recordPageCount]);

  const handleSaveRide = () => {
    const record = createRideRecord(settings);
    setRecords((current) => [record, ...current]);
    setRecordPage(recordSort === "recent" ? 1 : Number.MAX_SAFE_INTEGER);
    setBurstKey((key) => key + 1);
    setFeedback(
      record.mentalSavings >= 0
        ? "이미 낸 렌트비, 오늘도 조금 써먹음"
        : "이번 이동은 멘탈 적립 실패. 그래도 기록은 남겼어요",
    );
  };

  const handleDraftChange = (key: NumericSettingField, value: string) => {
    const nextValue = value === "" ? 0 : Number(value);
    setDraftSettings((current) => normalizeSettings({ ...current, [key]: nextValue }));
  };

  const handleDraftFuelMode = (fuelCostMode: Settings["fuelCostMode"]) => {
    setDraftSettings((current) => normalizeSettings({ ...current, fuelCostMode }));
  };

  const handleDistancePreset = (distanceKm: number) => {
    setSettings((current) => normalizeSettings({ ...current, distanceKm }));
    setDraftSettings((current) => normalizeSettings({ ...current, distanceKm }));
    setFeedback(`기본 이동거리를 ${formatNumber(distanceKm, 1)}km로 바꿨어요`);
  };

  const handleRecordSort = (sort: RecordSort) => {
    setRecordSort(sort);
    setRecordPage(1);
  };

  const handleRecordPeriod = (period: RecordPeriod) => {
    setRecordPeriod(period);
    setRecordPage(1);
  };

  const handleSettingsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSettings(normalizeSettings(draftSettings));
    setIsSettingsOpen(false);
    setFeedback("다음 적립부터 새 기준으로 계산해요");
  };

  const handleDeleteRecord = (id: string) => {
    setRecords((current) => current.filter((record) => record.id !== id));
    setFeedback("기록 하나를 정리했어요");
  };

  const handleResetAll = () => {
    if (!pendingReset) {
      setPendingReset(true);
      return;
    }

    setRecords([]);
    setRecordPage(1);
    setPendingReset(false);
    setFeedback("전체 기록을 비웠어요. 다시 차곡차곡 쌓아봐요");
  };

  return (
    <main className="page-shell">
      <section className="app-shell" aria-label="mental-mileage 앱">
        <header className="app-header">
          <div>
            <p className="eyebrow">mental-mileage</p>
            <h1>총 멘탈 적립금</h1>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="설정 열기"
            onClick={() => {
              setDraftSettings(settings);
              setIsSettingsOpen(true);
            }}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </header>

        <section className="total-panel" aria-live="polite">
          <p className="total-label">마음속 저금통</p>
          <strong className={stats.totalSavings < 0 ? "total-amount is-negative" : "total-amount"}>
            {formatWon(stats.totalSavings)}
          </strong>
          <p className="feedback">{feedback}</p>
        </section>

        <section className="quick-stats" aria-label="누적 요약">
          <div>
            <span>오늘 누적</span>
            <strong className={stats.todaySavings < 0 ? "is-negative" : ""}>
              {formatWon(stats.todaySavings)}
            </strong>
          </div>
          <div>
            <span>이번 달 누적</span>
            <strong className={stats.monthSavings < 0 ? "is-negative" : ""}>
              {formatWon(stats.monthSavings)}
            </strong>
          </div>
        </section>

        <section className="recovery-panel" aria-label="이번 달 렌트비 회수율">
          <div className="recovery-row">
            <span>이번 달 렌트비 회수율</span>
            <strong>{formatPercent(stats.recoveryRate)}</strong>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${stats.recoveryProgress}%` }} />
          </div>
          <p>{recoveryMessage(stats.recoveryRate)}</p>
        </section>

        <section className="action-panel" aria-label="이번 이동 적립">
          <div className="estimate-row">
            <span>이번 이동 예상</span>
            <strong className={estimate.mentalSavings < 0 ? "is-negative" : ""}>
              {formatWon(estimate.mentalSavings, true)}
            </strong>
          </div>
          <div className="estimate-detail">
            <span>유류비 {formatWon(estimate.fuelCost)}</span>
            <span>
              {formatNumber(settings.distanceKm, 1)}km · {fuelBasis}
            </span>
          </div>
          <div className="distance-quick-control" aria-label="기본 이동거리 빠른 설정">
            <div className="distance-quick-label">
              <span>기본 거리</span>
              <button
                className="distance-edit-button"
                type="button"
                onClick={() => {
                  setDraftSettings(settings);
                  setIsSettingsOpen(true);
                }}
              >
                직접 입력
              </button>
            </div>
            <div className="distance-presets">
              {distancePresets.map((distanceKm) => {
                const isActive = settings.distanceKm === distanceKm;
                return (
                  <button
                    key={distanceKm}
                    className={isActive ? "distance-button is-active" : "distance-button"}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleDistancePreset(distanceKm)}
                  >
                    {formatNumber(distanceKm, 0)}km
                  </button>
                );
              })}
            </div>
          </div>
          <div className="save-button-wrap">
            {burstKey > 0 && (
              <span key={burstKey} className="saving-burst" aria-hidden="true">
                {formatWon(estimate.mentalSavings, true)}
              </span>
            )}
            <button className="save-button" type="button" onClick={handleSaveRide}>
              <span>이번 이동 적립</span>
              <strong>
                {estimate.mentalSavings >= 0
                  ? `${formatWon(estimate.mentalSavings, true)} 적립`
                  : `${formatWon(estimate.mentalSavings, true)} 기록`}
              </strong>
            </button>
          </div>
          <p className="helper-text">대중교통 안 탄 값, 마음속 저금통에 저장</p>
        </section>

        <section className="records-section" aria-label="최근 적립 기록">
          <div className="section-title">
            <div>
              <h2>최근 기록</h2>
              {groupedRecords.length > 0 && (
                <p>
                  {groupStart + 1}-{Math.min(groupStart + GROUPS_PER_PAGE, groupedRecords.length)}{" "}
                  / {groupedRecords.length}묶음 · {records.length}건
                </p>
              )}
            </div>
            {records.length > 0 && (
              <button className="text-button" type="button" onClick={handleResetAll}>
                {pendingReset ? "정말 초기화" : "전체 초기화"}
              </button>
            )}
          </div>

          <div className="record-period-control" aria-label="기록 보기 단위">
            <button
              className={recordPeriod === "month" ? "period-button is-active" : "period-button"}
              type="button"
              aria-pressed={recordPeriod === "month"}
              onClick={() => handleRecordPeriod("month")}
            >
              월별
            </button>
            <button
              className={recordPeriod === "week" ? "period-button is-active" : "period-button"}
              type="button"
              aria-pressed={recordPeriod === "week"}
              onClick={() => handleRecordPeriod("week")}
            >
              주별
            </button>
            <button
              className={recordPeriod === "day" ? "period-button is-active" : "period-button"}
              type="button"
              aria-pressed={recordPeriod === "day"}
              onClick={() => handleRecordPeriod("day")}
            >
              일별
            </button>
          </div>

          <div className="record-sort-control" aria-label="기록 정렬">
            <button
              className={recordSort === "recent" ? "sort-button is-active" : "sort-button"}
              type="button"
              aria-pressed={recordSort === "recent"}
              onClick={() => handleRecordSort("recent")}
            >
              최근순
            </button>
            <button
              className={recordSort === "oldest" ? "sort-button is-active" : "sort-button"}
              type="button"
              aria-pressed={recordSort === "oldest"}
              onClick={() => handleRecordSort("oldest")}
            >
              오래된순
            </button>
          </div>

          {visibleRecordGroups.length === 0 ? (
            <p className="empty-state">아직 기록이 없어요. 첫 이동을 가볍게 적립해보세요.</p>
          ) : (
            <>
              <ul className="record-list">
                {visibleRecordGroups.map((group) => (
                  <li key={group.key} className="record-group">
                    <details>
                      <summary>
                        <span>
                          <strong>{group.label}</strong>
                          <small>
                            {group.records.length}건 · {formatNumber(group.distanceKm, 1)}km · 유류비{" "}
                            {formatWon(group.fuelCost)}
                          </small>
                        </span>
                        <b className={group.savings < 0 ? "is-negative" : ""}>
                          {formatWon(group.savings, true)}
                        </b>
                      </summary>
                      <ul className="group-record-list">
                        {group.records.map((record) => (
                          <li key={record.id} className="record-item">
                            <details>
                              <summary>
                                <span>
                                  <strong>{formatTime(record.createdAt)}</strong>
                                  <small>{formatNumber(record.distanceKm, 1)}km</small>
                                </span>
                                <b className={record.mentalSavings < 0 ? "is-negative" : ""}>
                                  {formatWon(record.mentalSavings, true)}
                                </b>
                              </summary>
                              <div className="record-detail">
                                <p>
                                  유류비 {formatWon(record.fuelCost)} · 대중교통비{" "}
                                  {formatWon(record.transitFare)}
                                </p>
                                {record.fuelCostMode === "fillup" ? (
                                  <p>
                                    주유 {formatWon(record.fillupAmount ?? 0)} /{" "}
                                    {formatNumber(record.fillupRangeKm ?? 0, 0)}km
                                  </p>
                                ) : (
                                  <p>
                                    연비 {formatNumber(record.fuelEfficiencyKmPerL, 1)}km/L · 유가{" "}
                                    {formatWon(record.fuelPricePerL)}/L
                                  </p>
                                )}
                                <button
                                  className="delete-button"
                                  type="button"
                                  onClick={() => handleDeleteRecord(record.id)}
                                >
                                  기록 삭제
                                </button>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
              {recordPageCount > 1 && (
                <nav className="record-pagination" aria-label="기록 페이지">
                  <button
                    type="button"
                    className="pagination-button"
                    onClick={() => setRecordPage((current) => Math.max(1, current - 1))}
                    disabled={currentRecordPage === 1}
                  >
                    이전
                  </button>
                  <span aria-live="polite">
                    {currentRecordPage} / {recordPageCount}
                  </span>
                  <button
                    type="button"
                    className="pagination-button"
                    onClick={() =>
                      setRecordPage((current) => Math.min(recordPageCount, current + 1))
                    }
                    disabled={currentRecordPage === recordPageCount}
                  >
                    다음
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </section>

      {isSettingsOpen && (
        <div className="sheet-backdrop" role="presentation">
          <section
            className="settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="sheet-header">
              <div>
                <p className="eyebrow">설정</p>
                <h2 id="settings-title">적립 기준</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="설정 닫기"
                onClick={() => setIsSettingsOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form className="settings-form" onSubmit={handleSettingsSubmit}>
              <fieldset className="mode-field">
                <legend>유류비 계산 방식</legend>
                <div className="fuel-mode-buttons">
                  <button
                    className={
                      draftSettings.fuelCostMode === "liter"
                        ? "mode-button is-active"
                        : "mode-button"
                    }
                    type="button"
                    aria-pressed={draftSettings.fuelCostMode === "liter"}
                    onClick={() => handleDraftFuelMode("liter")}
                  >
                    L당 가격
                  </button>
                  <button
                    className={
                      draftSettings.fuelCostMode === "fillup"
                        ? "mode-button is-active"
                        : "mode-button"
                    }
                    type="button"
                    aria-pressed={draftSettings.fuelCostMode === "fillup"}
                    onClick={() => handleDraftFuelMode("fillup")}
                  >
                    주유금액
                  </button>
                </div>
                <p>
                  주유금액 방식은 “한 번 넣은 돈”을 “대충 타는 거리”로 나눠서 km당
                  유류비를 계산해요.
                </p>
              </fieldset>

              {(draftSettings.fuelCostMode === "fillup" ? fillupFuelFields : literFuelFields).map(
                (field) => (
                  <label key={field.key} className="field">
                    <span>{field.label}</span>
                    <div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={field.step}
                        value={draftSettings[field.key]}
                        onChange={(event) => handleDraftChange(field.key, event.target.value)}
                      />
                      <em>{field.suffix}</em>
                    </div>
                  </label>
                ),
              )}

              {draftSettings.fuelCostMode === "fillup" && (
                <div className="fillup-presets" aria-label="주유금액 빠른 선택">
                  {fillupAmountPresets.map((amount) => {
                    const isActive = draftSettings.fillupAmount === amount;
                    return (
                      <button
                        key={amount}
                        className={isActive ? "preset-button is-active" : "preset-button"}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => handleDraftChange("fillupAmount", String(amount))}
                      >
                        {formatWon(amount)}
                      </button>
                    );
                  })}
                </div>
              )}

              {settingsFields.map((field) => (
                <label key={field.key} className="field">
                  <span>{field.label}</span>
                  <div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={field.step}
                      value={draftSettings[field.key]}
                      onChange={(event) => handleDraftChange(field.key, event.target.value)}
                    />
                    <em>{field.suffix}</em>
                  </div>
                </label>
              ))}
              <div className="sheet-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setDraftSettings(DEFAULT_SETTINGS)}
                >
                  기본값
                </button>
                <button className="primary-button" type="submit">
                  저장
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default App;
