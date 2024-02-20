import { JwtService } from '@nestjs/jwt';
import {
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { KeyFrameEvent } from './packet';
import axios from 'axios';
import { Cron, CronExpression } from '@nestjs/schedule';

type RoomInfo = {
  players: Map<string, string>;
  gameOver: Set<string>;
  max: number;
  scores: Map<string, number>;
  lastActivate: number;
  userTimers: Map<string, NodeJS.Timeout>; 
}
type Timers = {
  gameTimer: NodeJS.Timeout,
}

@WebSocketGateway(3001, {
  cors: {
    origin: '*',
    credentail: true,
  },
})
export class GameGateway {
  private rooms: Map<number, RoomInfo> = new Map();
  private roomTimers: Map<number,Timers> = new Map();
  private items = [
    "BOMB", "FOG", "FLIP", "ROTATE_RIGHT", "ROTATE_LEFT",
  ];

  constructor(private jwtService: JwtService) {}

  @WebSocketServer()
  server: Server;
  

  @Cron(CronExpression.EVERY_10_SECONDS)
  async findGhostRoom() {
    const currentTime = Date.now();
    this.rooms.forEach((room, roomId) => {
      if (currentTime - room.lastActivate >= 10000) {
        // this.deleteRoom(roomId);
      }
    });
  }

  private deleteRoom(roomId: number) {
    console.log('deleteRoom:',roomId,'번 방 삭제!!!!')
    this.rooms.delete(roomId);
    const timers = this.roomTimers.get(roomId);
    if(timers){
      clearInterval(timers.gameTimer);
      this.roomTimers.delete(roomId);
    }
  }

  private async updateLastActiveTime(roomId: number) {
    const currentTime = Date.now();
    const room = this.rooms.get(roomId);
    if(room){
      room.lastActivate = currentTime;  
    }
  }


  private async verifyToken(client: Socket): Promise<string> {
    let { token } = client.handshake.auth;
    token = token.split(' ')[1];
    try {
      const { sub: nickname } = await this.jwtService.verify(token);
      return nickname;
    } catch (err) {
      console.log(err);
      throw new Error(err)
    }
  }

  private parseQueryParam(param: string | string[]): number {
    return parseInt(Array.isArray(param) ? param[0] : param);
  }

  private setupRoom(roomId: number, maxPlayers: number): RoomInfo {
    const room = this.rooms.get(roomId) ?? {
      players: new Map(),
      gameOver: new Set(),
      max: maxPlayers,
      scores: new Map(),
      lastActivate: Date.now(),
      userTimers: new Map() 
    };
    this.rooms.set(roomId, room);
    return room;
  }

  private setupPlayer(room: RoomInfo, client: Socket) {
    const {roomId, nickname } = client.data
    room.players.set(nickname, client.id);
    room.lastActivate = Date.now();
    client.data = { nickname, roomId: client.handshake.query.roomId };
    client.join(client.handshake.query.roomId);
    this.broadcastToRoom(roomId, 'userJoined', nickname);
  }

  private broadcastToRoom(roomId: number, event: string, message: any) {
    this.server.to(roomId.toString()).emit(event, message);
  }

  private checkStartGame(roomId: number, room: RoomInfo) {
    if (room.players.size === room.max) {
      console.log('checkStartGame:',roomId, '번방 게임 시작!');
      this.broadcastToRoom(roomId, 'go', 'GO!');
    }
  }

  private startTimers(roomId: number) {
    const room = this.rooms.get(roomId);
    if(this.roomTimers.get(roomId)){
      return
    }
    const data:Timers = {
      gameTimer: this.mainTimer(roomId),
    }
    if(room.max > 1 ){
      this.startItemTimer(roomId);
    }
    const timer = this.roomTimers.get(roomId)?.gameTimer;
    if(timer){
      clearInterval(timer);
    }
    this.roomTimers.set(roomId, data);
  }

  private mainTimer(roomId: number) {
    let maxTime = 180;
    const intervalId = setInterval(() => {
      const minutes = Math.floor(maxTime / 60);
      const seconds = maxTime % 60;
      
      // 남은 시간을 MM:SS 형식으로 출력
      const time = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      console.log('mainTimer:',roomId, '번 방', time)
      this.broadcastToRoom(roomId, 'timer', time);
      maxTime -= 1;

      // if( maxTime % itemTime === 0 && maxTime >29){
      //   this.startItemTimer(roomId,roomSockets);
      // }
      if (maxTime < 0 || !this.rooms.get(roomId)) {
        const roomInfo = this.rooms.get(roomId);
        this.roomTimers.delete(roomId);
        this.broadcastToRoom(roomId, "gameEnd", true)
        console.log('mainTimer: TimerOver 퇴출 시작', roomInfo.players);
        const users = roomInfo.players.values();
        Array.from(users).forEach((user) => {
          const socket: Socket = this.server.sockets.sockets.get(user);
          if(socket){
            socket.disconnect();
          }
        });
        clearInterval(intervalId);
        console.log("Game finished!");
      }
    }, 1000);
    return intervalId
  }

  private startItemTimer(roomId: number) {
    const roomInfo = this.rooms.get(roomId)
    console.log("startItemTimer:::",roomInfo)
    roomInfo.players.forEach(( socketId, nickname) => {
      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket) return;
  
      const isOver = roomInfo.gameOver.has(nickname);
      if (isOver) return;
      const interval = roomInfo.userTimers.size < 1 ? 30000 : 40000;
      let maxCount = 180;
      const timer = setInterval(() => {
        maxCount -= interval/1000;
        if (roomInfo.gameOver.has(nickname) || !this.rooms.get(roomId)) {
          console.log(nickname, '타이머 종료')
          clearInterval(timer);
          return;
        }
        if(maxCount<20){
          return;
        }
        const randomItem = this.randomItems([...this.items]);
        console.log(`${nickname}에게 아이템 선택 시간!`);
        socket.emit('itemSelectTime', randomItem);
      }, interval);
  
      roomInfo.userTimers.set(nickname, timer);
    });
  }

  private randomItems(sourceArray: Array<string>): Array<string> {
    const result = [];
    for (let i = 0; i < 3; i++) {
      const index = Math.floor(Math.random() * sourceArray.length);
      result.push(sourceArray[index]);
      sourceArray.splice(index, 1);
    }

    return result;
  }

  async handleConnection(client: Socket) {
    try {
      const nickname: string = await this.verifyToken(client);
      const roomId: string | string[] = client.handshake.query.roomId;
      const max: string | string[] = client.handshake.query.max;
      const roomIdParam: number = this.parseQueryParam(roomId);
      const maxParam: number = this.parseQueryParam(max)
      const room = this.setupRoom(roomIdParam, maxParam)
      client.data = {
        nickname,
        roomId: roomIdParam,
      };
      console.log(`handleConnection: room 생성`,this.rooms.get(roomIdParam))
      client.join(`${roomIdParam}`);
      this.setupPlayer(room, client);
      console.log('handleConnection:',roomId, '번방 유저 join~ 현재', room.players.size, '명 ', room.players); 
      this.broadcastToRoom(roomIdParam,'userJoined',nickname);
      this.checkStartGame(roomIdParam, room);
      this.updateLastActiveTime(roomIdParam);
    } catch (e) {
      console.log(e);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const { nickname, roomId } = client.data;
    const roomInfo = this.rooms.get(parseInt(roomId));
    // if (!this.rooms.has(roomId)) { 
    //   return; 
    // }
    client.leave(`${roomId}`);
    client.broadcast.to(`${roomId}`).emit('userLeaved', nickname);
    console.log('HandDisconnect:',nickname, '이 잘 가고~');
    console.log('HandDisconnect: roomInfo.players=',roomInfo?.players);   
    roomInfo?.players.delete(nickname)
    if (roomInfo?.players.size <= 1) {
      console.log('HandDisconnect: 1명 나감',roomInfo.players);
      this.broadcastToRoom(roomId, "gameEnd", true);
      const user = roomInfo.players.values().next().value;
      const socket: Socket = this.server.sockets.sockets.get(user);
      if(socket){
        socket.disconnect();
      }
      this.deleteRoom(parseInt(roomId));
    }
  }

  @SubscribeMessage('eventOn')
  stateUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() event: KeyFrameEvent,
  ) {
    const { roomId }: { roomId: number } = client.data;
    client.broadcast.to(`${roomId}`).emit('eventOn', event);
    this.updateLastActiveTime(roomId);
  }

  @SubscribeMessage('reqWorldInfo')
  reqWorldInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() nickname: string,
  ) {
    const { roomId } = client.data;
    const roomInfo: RoomInfo = this.rooms.get(roomId);
    const target: string = roomInfo.players.get(nickname);
    client.to(target).emit('reqWorldInfo', '정보 내놔');
  }

  @SubscribeMessage('resWorldInfo')
  resWorldInfo() { } // @MessageBody() event: world, @ConnectedSocket() client: Socket,

  @SubscribeMessage('gameOver')
  async gameOver(
    @ConnectedSocket() client: Socket,
    @MessageBody() isOver: boolean
  ) {
    const { roomId, nickname } = client.data
    const roomInfo: RoomInfo = this.rooms.get(parseInt(roomId));
    roomInfo.gameOver.add(nickname);
    console.log(`GameOver: ${roomId}번 방 ${nickname}게임 오버\n`,roomInfo?.gameOver);
    // const score = roomInfo.scores.get(nickname);
    // const { data: result } = await axios.post('http://jeongminjo.shop:3000/user/score', {
    //   nickname,
    //   score
    // });
    // console.log(`점수 전송~ ${nickname}의 점수 ${score} 결과 : ${result}`);
    if (roomInfo?.gameOver.size === roomInfo?.players.size){
      this.gameEnd(roomInfo, roomId);
    }
  }

  gameEnd(room:RoomInfo, roomId:number) {
      this.broadcastToRoom(roomId, 'gameEnd', true);
      console.log('GameEnd: ',roomId, '번 방 둘다 gameOver,, 퇴출 시작', room.gameOver);
      const users = room.players.values();
      Array.from(users).forEach((user) => {
        const socket: Socket = this.server.sockets.sockets.get(user);
        socket.disconnect();
      })
  }

  @SubscribeMessage('updateScore')
  async updateScore(
    @ConnectedSocket() client: Socket,
    @MessageBody() score: number
  ) {
    await this.verifyToken(client);
    const { roomId, nickname } = client.data;
    const roomInfo = this.rooms.get(roomId);
    const prevScores = roomInfo.scores.get(nickname);
    roomInfo.scores.set(nickname, prevScores + score);
  }

  @SubscribeMessage('item')
  useItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() item: string
  ) {
    const { roomId, nickname } = client.data;
    client.broadcast.to(`${roomId}`).emit('selectedItem', item);
    console.log('Item:', nickname, '<< 아이템 사용', item, '<<<');
  }

  @SubscribeMessage('playOn')
  gamePlay(
    @ConnectedSocket() client:Socket,
  ){
    const roomId = parseInt(client.data.roomId);
    this.startTimers(roomId);
    this.updateLastActiveTime(roomId);
  }
}

type world = {
  nickname: string;
  keyframe: number;
  serialize: Uint8Array;
};
