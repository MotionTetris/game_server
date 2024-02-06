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

type RoomInfo = {
  players: Map<string, string>;
  gameOver: Set<string>;
}

@WebSocketGateway(3001, {
  cors: {
    origin: '*',
    credentail: true,
  },
})
export class GameGateway {
  constructor(private jwtService: JwtService) {}

  @WebSocketServer()
  server: Server;
  rooms: Map<number, RoomInfo> = new Map();

  async verifyToken(client: Socket): Promise<string> {
    let { token } = client.handshake.auth;
    token = token.split(' ')[1];
    // const token = client.handshake.headers.authorization.split(' ')[1]
    try {
      const { sub: nickname } = await this.jwtService.verify(token);
      return nickname;
    } catch (err) {
      console.log(err);
      throw new Error(err)
    }
  }

  async handleConnection(client: Socket) {
    try {
      const nickname: string = await this.verifyToken(client);
      const roomIdParam: string | string[] = client.handshake.query.roomId;
      const roomId = parseInt(Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam);

      const hasRoom: boolean = this.rooms.has(roomId);
      if (!hasRoom) {
        const data:RoomInfo = {
          players: new Map(),
          gameOver: new Set(),
        }
        data.players.set(nickname, client.id)
        this.rooms.set(roomId, data);
      }

      const roomInfo: RoomInfo = this.rooms.get(roomId);
      roomInfo.players.set(nickname, client.id)
      client.data = {
        nickname,
        roomId,
      };
      client.join(`${roomId}`);
      client.broadcast.to(`${roomId}`).emit('userJoined', nickname);
      client.emit('myName',nickname)
      console.log('유저 조인', roomInfo.players.size, roomInfo.players);
      if (roomInfo.players.size == 2) {
        this.server.to(`${roomId}`).emit('gameStart', 'userStart');
      }
    } catch (e) {
      console.log(e);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const {nickname, roomId}:{nickname:string, roomId:number} = client.data;
    const hasRoom = this.rooms.has(roomId);
    let roomInfo:RoomInfo;

    if (!roomId || !hasRoom) {
      return
    }
    roomInfo = this.rooms.get(roomId);
    roomInfo.players.delete(nickname)
    if(roomInfo.players.size === 0){
      this.rooms.delete(roomId);
    }
    client.emit('event','바윙~^^')
    client.leave(`${roomId}`);
    client.broadcast.to(`${roomId}`).emit('userLeaved', nickname);
  }

  @SubscribeMessage('eventOn')
  stateUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() event: KeyFrameEvent,
  ) {
    const { roomId }:{roomId:number} = client.data;
    client.broadcast.to(`${roomId}`).emit('eventOn', event);
  }

  @SubscribeMessage('reqWorldInfo')
  reqWorldInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() nickname: string,
  ) {
    console.log(nickname);
    const { roomId } = client.data;
    const roomInfo:RoomInfo = this.rooms.get(roomId);
    const target:string = roomInfo.players.get(nickname);
    client.to(target).emit('reqWorldInfo', '정보 내놔');
  }

  @SubscribeMessage('resWorldInfo')
  resWorldInfo() {} // @MessageBody() event: world, // @ConnectedSocket() client: Socket,

  @SubscribeMessage('gameOver')
  gameOver(
    @ConnectedSocket() client:Socket,
    @MessageBody() isOver:boolean
  ){
    const {roomId, nickname} = client.data
    const roomInfo = this.rooms.get(roomId)
    if(isOver){
      roomInfo.gameOver.add(nickname)
      console.log(roomInfo.gameOver)
    }

    if(roomInfo.gameOver.size === roomInfo.players.size){
      console.log('퇴출 시작',roomInfo.gameOver)
      const users = roomInfo.players.values()
      Array.from(users).forEach((user)=>{
        const socket:Socket = this.server.sockets.sockets.get(user)
        socket.disconnect()
      })
    }
  }
}

type world = {
  nickname: string;
  keyframe: number;
  serialize: Uint8Array;
};
