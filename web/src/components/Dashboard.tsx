import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getLogs, getSummary } from "../api/client";
import type { LogsResponse, PublicUpload, UploadSummaryResponse } from "../api/types";
import { dateFilterToQuery, fullRangeFilter, type DateFilter } from "../utils/dateFilter";
import { Alert } from "./Alert";
import { DashboardHeader } from "./DashboardHeader";
import { DateRangeFilter } from "./DateRangeFilter";
import { LoadingState, MetricSkeletons } from "./LoadingState";
import { LogsTable } from "./LogsTable";
import { StatsPanel } from "./StatsPanel";

interface DashboardProps {
  upload: PublicUpload;
  onReset: () => void;
}

export function Dashboard({ upload, onReset }: DashboardProps) {
  const startDate = upload.range.startDate;
  const endDate = upload.range.endDate;

  if (startDate === null || endDate === null) {
    return (
      <>
        <DashboardHeader upload={upload} onReset={onReset} />
        <main className="page-container dashboard">
          <Alert tone="error" title="This upload has no queryable date range.">
            Upload another CSV or inspect the API processing result.
          </Alert>
        </main>
      </>
    );
  }

  return <QueryableDashboard upload={upload} startDate={startDate} endDate={endDate} onReset={onReset} />;
}

function QueryableDashboard({
  upload,
  startDate,
  endDate,
  onReset,
}: DashboardProps & { startDate: string; endDate: string }) {
  const initialFilter = useMemo(() => fullRangeFilter(startDate, endDate), [startDate, endDate]);
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialFilter);
  const [serviceId, setServiceId] = useState("");
  const [pageSize, setPageSize] = useState(50);

  const [summary, setSummary] = useState<UploadSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<ApiError | Error | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [logPages, setLogPages] = useState<LogsResponse[]>([]);
  const [logPageIndex, setLogPageIndex] = useState(0);
  const [logsError, setLogsError] = useState<ApiError | Error | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);

  const query = useMemo(() => dateFilterToQuery(dateFilter), [dateFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    void getSummary(upload.uploadId, query, controller.signal)
      .then(setSummary)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSummaryError(error instanceof Error ? error : new Error("Unable to load summary."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [upload.uploadId, query]);

  useEffect(() => {
    const controller = new AbortController();
    setLogsLoading(true);
    setLogsError(null);
    setLogPages([]);
    setLogPageIndex(0);
    void getLogs(
      upload.uploadId,
      { ...query, ...(serviceId === "" ? {} : { serviceId }), pageSize },
      controller.signal,
    )
      .then((page) => setLogPages([page]))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLogsError(error instanceof Error ? error : new Error("Unable to load logs."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLogsLoading(false);
      });
    return () => controller.abort();
  }, [upload.uploadId, query, serviceId, pageSize]);

  const currentPage = logPages[logPageIndex] ?? null;

  const nextPage = useCallback(async () => {
    if (currentPage?.nextCursor === null || currentPage?.nextCursor === undefined || logsLoading) return;
    const cached = logPages[logPageIndex + 1];
    if (cached !== undefined) {
      setLogPageIndex((index) => index + 1);
      return;
    }
    setLogsLoading(true);
    setLogsError(null);
    try {
      const page = await getLogs(upload.uploadId, {
        ...query,
        ...(serviceId === "" ? {} : { serviceId }),
        pageSize,
        cursor: currentPage.nextCursor,
      });
      setLogPages((pages) => [...pages.slice(0, logPageIndex + 1), page]);
      setLogPageIndex((index) => index + 1);
    } catch (error) {
      setLogsError(error instanceof Error ? error : new Error("Unable to load the next page."));
    } finally {
      setLogsLoading(false);
    }
  }, [currentPage, logPages, logPageIndex, logsLoading, pageSize, query, serviceId, upload.uploadId]);

  function applyFilters(nextDateFilter: DateFilter, nextServiceId: string, nextPageSize: number) {
    setDateFilter(nextDateFilter);
    setServiceId(nextServiceId);
    setPageSize(nextPageSize);
  }

  return (
    <>
      <DashboardHeader upload={upload} onReset={onReset} />
      <main className="page-container dashboard">
        {summaryError ? (
          <Alert
            tone="error"
            title={summaryError.message}
            requestId={summaryError instanceof ApiError ? summaryError.requestId : null}
          >
            The dashboard could not refresh the selected summary.
          </Alert>
        ) : null}

        {summaryLoading && summary === null ? <MetricSkeletons /> : summary ? <StatsPanel summary={summary} /> : null}

        <DateRangeFilter
          minDate={startDate}
          maxDate={endDate}
          value={dateFilter}
          serviceId={serviceId}
          services={upload.services}
          pageSize={pageSize}
          onApply={applyFilters}
        />

        {logsError ? (
          <Alert
            tone="error"
            title={logsError.message}
            requestId={logsError instanceof ApiError ? logsError.requestId : null}
          >
            Adjust the filters or try the request again.
          </Alert>
        ) : null}

        {logsLoading && currentPage === null ? (
          <LoadingState label="Loading observations" />
        ) : currentPage ? (
          <div className={logsLoading ? "logs-content logs-content--loading" : "logs-content"} aria-busy={logsLoading}>
            <LogsTable
              page={currentPage}
              pageNumber={logPageIndex + 1}
              canGoPrevious={logPageIndex > 0}
              onPrevious={() => setLogPageIndex((index) => Math.max(0, index - 1))}
              onNext={() => void nextPage()}
            />
            {logsLoading ? <div className="inline-loading"><span className="spinner" /> Loading next page…</div> : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
