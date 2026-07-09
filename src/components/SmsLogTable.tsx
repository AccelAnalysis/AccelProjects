import type { SmsLog } from "../types";

type SmsLogTableProps = {
  smsLogs: SmsLog[];
  emptyMessage?: string;
};

export function SmsLogTable({ smsLogs, emptyMessage = "No SMS logs yet." }: SmsLogTableProps) {
  if (smsLogs.length === 0) {
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Created At</th>
            <th>Order ID</th>
            <th>Recipient Phone</th>
            <th>Message Preview</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Provider Message ID</th>
            <th>Error Message</th>
          </tr>
        </thead>
        <tbody>
          {smsLogs.map((smsLog) => (
            <tr key={smsLog.id}>
              <td>{new Date(smsLog.createdAt).toLocaleString()}</td>
              <td className="order-id">{smsLog.orderId}</td>
              <td>{smsLog.recipientPhone}</td>
              <td>{smsLog.messagePreview}</td>
              <td>{smsLog.provider}</td>
              <td>
                <span className={`status-pill status-${smsLog.status}`}>{smsLog.status}</span>
              </td>
              <td>{smsLog.providerMessageId || "None"}</td>
              <td>{smsLog.errorMessage || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
