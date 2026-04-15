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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface border border-white/[0.1] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-scale-in">
        <div className="text-xs text-zinc-500 mb-1 font-medium">Approval Request</div>
        <h3 className="text-lg font-semibold font-display mb-3">
          {requesterName}&apos;s agent wants to {action}
        </h3>
        <div className="bg-elevated rounded-lg p-3 mb-4">
          <div className="text-sm font-medium text-blue-400">{resource}</div>
          <div className="text-sm text-zinc-300 mt-1">{description}</div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium transition"
          >
            Approve
          </button>
          <button
            onClick={onDeny}
            className="flex-1 bg-elevated hover:bg-white/[0.08] border border-white/[0.06] text-white py-2.5 rounded-lg text-sm font-medium transition"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
