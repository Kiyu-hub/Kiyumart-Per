import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface UserAvatarProps {
  profileImage?: string | null;
  name?: string;
  email?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function UserAvatar({
  profileImage,
  name = "User",
  email,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const fallbackTextSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email?.charAt(0).toUpperCase() || "U";
  };

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      {profileImage && <AvatarImage src={profileImage} alt={name} />}
      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
        <span className={fallbackTextSizes[size]}>
          {getInitials(name, email)}
        </span>
      </AvatarFallback>
    </Avatar>
  );
}
