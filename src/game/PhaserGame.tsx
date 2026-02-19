import { useEffect, useRef } from "react";
import Phaser from "phaser";

class MainScene extends Phaser.Scene {
  private archer!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private facingRight = true;

  constructor() {
    super("MainScene");
  }

  preload() {
    this.load.spritesheet("idle", "/assets/Archer_Idle.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("run", "/assets/Archer_Run.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
  }

  create() {
    this.anims.create({
      key: "archer-idle",
      frames: this.anims.generateFrameNumbers("idle", { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "archer-run",
      frames: this.anims.generateFrameNumbers("run", { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    this.archer = this.add.sprite(400, 300, "idle");
    this.archer.setScale(2);
    this.archer.play("archer-idle");

    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update() {
    const speed = 3;

    if (this.cursors.right.isDown) {
      this.archer.x += speed;
      this.archer.setFlipX(false);
      if (this.archer.anims.currentAnim?.key !== "archer-run") {
        this.archer.play("archer-run");
      }
    } else if (this.cursors.left.isDown) {
      this.archer.x -= speed;
      this.archer.setFlipX(true);
      if (this.archer.anims.currentAnim?.key !== "archer-run") {
        this.archer.play("archer-run");
      }
    } else {
      if (this.archer.anims.currentAnim?.key !== "archer-idle") {
        this.archer.play("archer-idle");
      }
    }
  }
}

const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#8fbc8f",
      scene: MainScene,
      pixelArt: true,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="flex items-center justify-center min-h-screen bg-background" />;
};

export default PhaserGame;
