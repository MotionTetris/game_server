export class KeyFrameEvent {
  userId: string;
  event: PlayerEventType;
  keyframe: number;
  sequence: number;

  public constructor(
    userId: string,
    event: PlayerEventType,
    keyframe: number,
    sequence: number,
  ) {
    this.userId = userId;
    this.event = event;
    this.keyframe = keyframe;
    this.sequence = sequence;
  }
}

export enum PlayerEventType {
  MOVE_LEFT = 0,
  MOVE_RIGHT = 1,
  TURN_LEFT = 2,
  TRUN_RIGHT = 3,
}

export interface TetrisOption {
  wallColor?: BlockColor;
  wallAlpha?: number;
  backgroundColor?: number;
  backgroundAlpha?: number;
  spawnX?: number;
  spawnY?: number;
  blockFriction: number;
  blockRestitution: number;
  blockSize: number;
  combineDistance: number;
  view: HTMLCanvasElement;
  worldWidth: number;
  worldHeight: number;
}

type BlockColor = keyof ColorPalette

class ColorPalette {
    "blue" = [0xf3d9b1, 0x98c1d9, 0x053c5e, 0x1f7a8c];
    "red" = [0xf3d9b1, 0xd90429, 0xef233c, 0xff6363];
    "green" = [0xf3d9b1, 0x056608, 0x2b8135, 0x3c996e];
    "yellow" = [0xf3d9b1, 0xffd166, 0xffed47, 0xffef96];
    "purple" = [0xf3d9b1, 0x6a0572, 0xab83a1, 0xd4a5a5];
    "orange" = [0xf3d9b1, 0xfca311, 0xfea82f, 0xffd151];
    "teal" = [0xf3d9b1, 0x005b5d, 0x009393, 0x66cccc];
    "pink" = [0xf3d9b1, 0xd00000, 0xff4343, 0xff9e9e];
    "brown" = [0xf3d9b1, 0x4e342e, 0x7b5e57, 0xa1887f];
    "indigo" = [0xf3d9b1, 0x303f9f, 0x5c6bc0, 0x9fa8da];
    "lime" = [0xf3d9b1, 0xa8d8ea, 0x92c9b1, 0x7fae92];
    "cyan" = [0xf3d9b1, 0x00acc1, 0x26c6da, 0x4dd0e1];
    "lavender" = [0xf3d9b1, 0x8675a9, 0xa39fc9, 0xc7b2de];
    "mustard" = [0xf3d9b1, 0xffdb58, 0xffe082, 0xffecb3];
    "peach" = [0xf3d9b1, 0xff8c61, 0xffb38a, 0xffdab9];
    "olive" = [0xf3d9b1, 0x607c47, 0x879961, 0xa7b485];
    "magenta" = [0xf3d9b1, 0x8e44ad, 0xc39bd3, 0xe6ccff];
    "maroon" = [0xf3d9b1, 0x800000, 0xa52a2a, 0xb73b3b];
    "gold" = [0xf3d9b1, 0xffd700, 0xffe400, 0xffeb3b];
    "navy" = [0xf3d9b1, 0x001f3f, 0x003366, 0x004080];
}
