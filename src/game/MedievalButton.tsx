import React, { useState } from "react";

interface MedievalButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant: "blue" | "red";
  className?: string;
}

const MedievalButton: React.FC<MedievalButtonProps> = ({ onClick, children, variant, className = "" }) => {
  const [pressed, setPressed] = useState(false);

  const regular = variant === "blue"
    ? "/assets/BigBlueButton_Regular.png"
    : "/assets/BigRedButton_Regular.png";
  const pressedImg = variant === "blue"
    ? "/assets/BigBlueButton_Pressed.png"
    : "/assets/BigRedButton_Pressed.png";

  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={`relative font-bold text-sm tracking-wide transition-transform duration-75 select-none ${pressed ? "scale-95" : "hover:scale-105"} ${className}`}
      style={{
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        minWidth: 120,
        minHeight: 44,
      }}
    >
      <img
        src={pressed ? pressedImg : regular}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          imageRendering: "pixelated",
          borderImageSlice: "30% fill",
          objectFit: "fill",
        }}
      />
      <span
        className="relative z-10 px-5 py-2.5 block"
        style={{
          color: variant === "blue" ? "hsl(200 20% 95%)" : "hsl(0 20% 95%)",
          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
          transform: pressed ? "translateY(1px)" : "none",
        }}
      >
        {children}
      </span>
    </button>
  );
};

export default MedievalButton;
