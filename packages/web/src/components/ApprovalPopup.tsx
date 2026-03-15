/**
 * ApprovalPopup — the human-in-the-loop approval UI.
 * Shows when an agent requests access to another employee's data/files.
 * One-click approve or deny.
 */

interface ApprovalPopupProps {
  requesterName: string;
  action: string;
  resource: string;
  description: string;
  onApprove: () => void;
  onDeny: () => void;
}

export default function ApprovalPopup({
  requesterName,
  action,
  resource,
  description,
  onApprove,
  onDeny,
}: ApprovalPopupProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-sm text-gray-400 mb-1">Approval Request</div>
        <h3 className="text-lg font-semibold mb-3">
          {requesterName}&apos;s agent wants to {action}
        </h3>
        <div className="bg-gray-800 rounded-lg p-3 mb-4">
          <div className="text-sm font-medium text-blue-400">{resource}</div>
          <div className="text-sm text-gray-300 mt-1">{description}</div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg font-medium transition"
          >
            Approve
          </button>
          <button
            onClick={onDeny}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg font-medium transition"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
