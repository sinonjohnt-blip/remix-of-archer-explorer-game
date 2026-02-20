import { useEffect, useRef, useState, useCallback } from "react";
import Phaser from "phaser";
import MedievalButton from "./MedievalButton";
import UnitSelector from "./UnitSelector";
import GoldDisplay from "./GoldDisplay";
import { MainScene } from "./scenes/MainScene";
import type { UnitType } from "./types";

const UNIT_COSTS: Record<UnitType, number> = { archer: 50, warrior: 80 };
const STARTING_GOLD = 500;

const PhaserGame = () => {
  const gameRef      = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("archer");
  const [blueGold, setBlueGold] = useState(STARTING_GOLD);
  const [redGold,  setRedGold]  = useState(STARTING_GOLD);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#4a6741",
      scene: MainScene,
      pixelArt: true,
    });
    gameRef.current = game;

    // Wait for scene to boot then bind events
    const checkScene = setInterval(() => {
      const s = game.scene.getScene("MainScene") as MainScene;
      if (s?.events) {
        clearInterval(checkScene);
        s.events.on("unit-placed", (data: { team: "blue" | "red"; cost: number }) => {
          if (data.team === "blue") setBlueGold(g => g - data.cost);
          else                      setRedGold(g => g - data.cost);
        });
      }
    }, 100);

    return () => {
      clearInterval(checkScene);
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const getScene = useCallback((): MainScene | null =>
    (gameRef.current?.scene.getScene("MainScene") as MainScene) ?? null,
  []);

  const handleStart = useCallback(() => getScene()?.startBattle(), [getScene]);

  const handleClear = useCallback(() => {
    getScene()?.clearAll();
    setBlueGold(STARTING_GOLD);
    setRedGold(STARTING_GOLD);
  }, [getScene]);

  const handleUnitSelect = useCallback((type: UnitType) => {
    setSelectedUnit(type);
    const s = getScene();
    if (s) {
      s.selectedUnitType = type;
      s.goldRef = { blue: blueGold, red: redGold };
    }
  }, [getScene, blueGold, redGold]);

  // Keep gold synced into scene every render
  useEffect(() => {
    const s = getScene();
    if (s) s.goldRef = { blue: blueGold, red: redGold };
  }, [blueGold, redGold, getScene]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-0"
      style={{ background: "linear-gradient(180deg, hsl(30 20% 15%) 0%, hsl(25 25% 10%) 100%)" }}
    >
      {/* ── Gold row ── */}
      <div
        className="flex items-center justify-between w-full px-4 py-2 rounded-t-lg border-x-4 border-t-4"
        style={{
          maxWidth: 800,
          background: "linear-gradient(180deg, hsl(30 18% 16%) 0%, hsl(25 15% 12%) 100%)",
          borderColor: "hsl(30 30% 22%)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: "hsl(210 60% 65%)", fontFamily: "Cinzel, serif" }}>Blue</span>
          <GoldDisplay gold={blueGold} />
        </div>
        <span
          className="text-sm font-bold uppercase tracking-widest"
          style={{ color: "hsl(40 30% 50%)", fontFamily: "MedievalSharp, cursive" }}
        >
          Tiny Battle
        </span>
        <div className="flex items-center gap-2">
          <GoldDisplay gold={redGold} />
          <span className="text-xs font-bold" style={{ color: "hsl(0 60% 65%)", fontFamily: "Cinzel, serif" }}>Red</span>
        </div>
      </div>

      {/* ── Battlefield ── */}
      <div className="overflow-hidden border-x-4" style={{ borderColor: "hsl(30 30% 22%)" }}>
        <div ref={containerRef} />
      </div>

      {/* ── Control bar ── */}
      <div
        className="flex items-center justify-center gap-4 px-6 py-3 rounded-b-lg border-x-4 border-b-4"
        style={{
          background: "linear-gradient(180deg, hsl(30 20% 18%) 0%, hsl(25 18% 12%) 100%)",
          borderColor: "hsl(30 30% 22%)",
        }}
      >
        <UnitSelector selected={selectedUnit} onSelect={handleUnitSelect} />
        <div className="w-px self-stretch mx-1" style={{ background: "hsl(30 15% 28%)" }} />
        <MedievalButton variant="blue" onClick={handleStart} icon="/assets/Icon_Sword.png">
          Battle
        </MedievalButton>
        <MedievalButton variant="red" onClick={handleClear} icon="/assets/Icon_Cross.png">
          Clear
        </MedievalButton>
      </div>
    </div>
  );
};

export default PhaserGame;
