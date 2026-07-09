import type { EmailLog } from "../types";

type EmailLogTableProps = {
  emailLogs: EmailLog[];
  emptyMessage?: string;
};

export function EmailLogTable({ emailLogs, emptyMessage = "No email logs yet." }: EmailLogTableProps) {
  if (emailLogs.length === 0) {
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Created At</th>
            <th>Order ID</th>
            <th>Recipient</th>
            <th>Subject</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Error Message</th>
          </tr>
        </thead>
        <tbody>
          {emailLogs.map((emailLog) => (
            <tr key={emailLog.id}>
              <td>{new Date(emailLog.createdAt).toLocaleString()}</td>
              <td className="order-id">{emailLog.orderId}</td>
              <td>{emailLog.recipientEmail}</td>
              <td>{emailLog.subject}</td>
              <td>{emailLog.provider}</td>
              <td>
                <span className={`status-pill status-${emailLog.status}`}>{emailLog.status}</span>
              </td>
              <td>{emailLog.errorMessage || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
