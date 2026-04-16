/**
 * ApprovalPopup — human-in-the-loop approval UI.
 * Shows when an agent requests access to another employee's data/files.
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-ink border border-white/[0.1] rounded-2xl p-6 max-w-md w-full mx-4 shadow-lift animate-scale-in">
        <div className="eyebrow mb-2">Approval request</div>
        <h3 className="text-lg font-medium text-bone mb-3 leading-snug">
          {requesterName}&apos;s agent wants to {action}
        </h3>
        <div className="bg-graphite border border-white/[0.06] rounded-lg p-3 mb-5">
          <div className="text-sm font-medium text-claret">{resource}</div>
          <div className="text-sm text-parchment mt-1 leading-relaxed">
            {description}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 btn btn-primary text-sm py-2.5"
          >
            Approve
          </button>
          <button
            onClick={onDeny}
            className="flex-1 btn btn-secondary text-sm py-2.5"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
