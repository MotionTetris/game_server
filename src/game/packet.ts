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
