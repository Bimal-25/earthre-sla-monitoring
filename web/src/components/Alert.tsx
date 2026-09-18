import { Icon } from "./Icon";

interface AlertProps {
  tone: "error" | "warning" | "info" | "success";
  title: string;
  children?: React.ReactNode;
  requestId?: string | null;
}

export function Alert({ tone, title, children, requestId }: AlertProps) {
  const icon = tone === "error" ? "error" : tone === "success" ? "check" : tone === "info" ? "info" : "warning";
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={icon} className="alert__icon" />
      <div className="alert__body">
        <strong className="alert__title">{title}</strong>
        {children ? <div className="alert__content">{children}</div> : null}
        {requestId ? <div className="alert__request-id">Request ID: {requestId}</div> : null}
      </div>
    </div>
  );
}
