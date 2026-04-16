import { getInitials, deptAvatarClass } from "@/lib/departments";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  xs: "w-6 h-6 text-[9px]",
  sm: "w-8 h-8 text-[10px]",
  md: "w-10 h-10 text-xs",
  lg: "w-12 h-12 text-sm",
};

interface DeptAvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

export default function DeptAvatar({
  name,
  size = "sm",
  className = "",
}: DeptAvatarProps) {
  return (
    <div
      className={`${SIZE[size]} ${deptAvatarClass} rounded-full flex items-center justify-center font-semibold tracking-wide ${className}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
