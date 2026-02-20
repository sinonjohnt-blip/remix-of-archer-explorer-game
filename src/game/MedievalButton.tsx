import React, { useState } from "react";

interface MedievalButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant: "blue" | "red";
  className?: string;
  icon?: string;
}

const MedievalButton: React.FC<MedievalButtonProps> = ({
  onClick, children, variant, className = "", icon,
}) => {
  const [pressed, setPressed] = useState(false);

  // Use the large button sprites for the main action buttons
  const regular   = variant === "blue"
    ? "/assets/BigBlueButton_Regular.png"
    : "/assets/BigRedButton_Regular.png";
  const pressedImg = variant === "blue"
    ? "/assets/BigBlueButton_Pressed.png"
    : "/assets/BigRedButton_Pressed.png";

  const labelColor = variant === "blue"
    ? "hsl(200 80% 90%)"
    : "hsl(0 80% 92%)";

  const glowColor = variant === "blue"
    ? "0 0 10px hsla(200,80%,60%,0.45)"
    : "0 0 10px hsla(0,70%,55%,0.45)";

  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={`relative font-bold text-sm tracking-wide select-none ${className}`}
      style={{
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        minWidth: 120,
        minHeight: 42,
        transform: pressed ? "scale(0.94)" : "scale(1)",
        transition: "transform 0.07s ease, filter 0.12s ease",
        filter: pressed ? "brightness(0.85)" : `drop-shadow(${glowColor})`,
        fontFamily: "Cinzel, serif",
      }}
    >
      {/* Sprite background — fill entire button area */}
      <img
        src={pressed ? pressedImg : regular}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ imageRendering: "pixelated", objectFit: "fill" }}
      />

      {/* Label row on top of sprite */}
      <span
        className="relative z-10 flex items-center justify-center gap-1.5 w-full h-full px-4 py-2"
        style={{
          color: labelColor,
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          transform: pressed ? "translateY(2px)" : "none",
          transition: "transform 0.07s ease",
        }}
      >
        {icon && (
          <img
            src={icon}
            alt=""
            className="w-4 h-4 flex-shrink-0"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
        )}
        {children}
      </span>
    </button>
  );
};

export default MedievalButton;
