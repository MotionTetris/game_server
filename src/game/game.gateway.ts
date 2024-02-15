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
}

@WebSocketGateway(3001, {
  cors: {
    origin: '*',
    credentail: true,
  },
})
export class GameGateway {

  private roomTimers: Map<number, NodeJS.Timeout> = new Map();
  private items = [
    "BOMB", "FOG", "FLIP", "ROTATE_RIGHT", "ROTATE_LEFT",
  ];

  constructor(private jwtService: JwtService) { }

  @WebSocketServer()
  server: Server;
  rooms: Map<number, RoomInfo> = new Map();

  @Cron(CronExpression.EVERY_MINUTE)
  async findGhostRoom() {
    const currentTime = Date.now();
    const inactiveRoomIds = [];

    this.rooms.forEach((room, roomId) => {
      if (currentTime - room.lastActivate > 60000) {
        inactiveRoomIds.push(roomId);
      }
    });
    inactiveRoomIds.forEach(roomId => this.rooms.delete(roomId));
  }

  async updateLastActiveTime(roomId: number) {
    const currentTime = Date.now();
    this.rooms.get(roomId).lastActivate = currentTime;
  }


  async verifyToken(client: Socket): Promise<string> {
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

  async handleConnection(client: Socket) {
    try {
      const nickname: string = await this.verifyToken(client);
      const roomId: string | string[] = client.handshake.query.roomId;
      const max: string | string[] = client.handshake.query.max;
      const roomIdParam: number = parseInt(Array.isArray(roomId) ? roomId[0] : roomId);
      const maxParam: number = parseInt(Array.isArray(max) ? max[0] : max);


      let roomInfo:RoomInfo|undefined = this.rooms.get(roomIdParam);
      console.log(roomInfo)
      if (!roomInfo) {
        const data: RoomInfo = {
          players: new Map(),
          gameOver: new Set(),
          max: maxParam,
          scores: new Map(),
          lastActivate: Date.now()
        }
        data.players.set(nickname, client.id)
        this.rooms.set(roomIdParam, data);
        console.log('방 생성함::',this.rooms.get(roomIdParam));
      }

      roomInfo = this.rooms.get(roomIdParam);
      roomInfo.players.set(nickname, client.id);
      client.data = {
        nickname,
        roomId: roomIdParam,
      };
      client.join(`${roomIdParam}`);
      client.broadcast.to(`${roomIdParam}`).emit('userJoined', nickname);
      client.emit('myName', nickname);
      console.log(roomIdParam, '번방 유저 조인', roomInfo.players.size, '명 ', roomInfo.players);
      if (roomInfo.players.size == maxParam) {
        console.log(roomIdParam, '번방 게임 시작!');
        this.server.to(`${roomIdParam}`).emit('go', 'GO!');
        this.roomTimers.set(roomIdParam, this.itemTimer(roomIdParam));
        this.gameTimer(roomIdParam);
        this.updateLastActiveTime(roomIdParam);
      }
    } catch (e) {
      console.log(e);
      client.disconnect();
    }
  }

  gameTimer(roomId: number) {
    let maxTime = 240;
    const intervalId = setInterval(() => {
      const minutes = Math.floor(maxTime / 60);
      const seconds = maxTime % 60;

      // 남은 시간을 MM:SS 형식으로 출력
      const time = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      console.log(time)
      this.server.to(`${roomId}`).emit('timer', time);
      maxTime -= 1;
      if (maxTime < 0) {
        clearInterval(intervalId);
        const roomInfo = this.rooms.get(roomId);
        if (roomInfo) {
          const players = Array.from(roomInfo.players.keys());
          players.forEach((player) => {
            roomInfo.gameOver.add(player);
          })
        }
        this.gameEnd(roomId);
        console.log("Game finished!");
      }
    }, 1000);
  }

  itemTimer(roomId: number) {
    let maxTime = 240;
    return setInterval(() => {
      const roomSockets = this.server.sockets.adapter.rooms.get(`${roomId}`);
      maxTime -= 30;
      if (roomSockets) {
        roomSockets.forEach((socketId) => {
          const socket = this.server.sockets.sockets.get(socketId);
          const { nickname } = socket.data;
          const isOver = this.rooms.get(roomId).gameOver.has(nickname)

          const randomItem: Array<string> = this.randomItems(this.items);
          if (socket && !isOver && maxTime > 30) {
            console.log(socket.data.nickname, '템 선택해보자~', '남은 시간', maxTime)
            socket.emit('itemSelectTime', randomItem);
          }
        });
      }
    }, 30000)
  }

  randomItems(sourceArray: Array<string>): Array<string> {
    const arrayCopy = [...sourceArray];
    const result = [];
    for (let i = 0; i < 3; i++) {
      const index = Math.floor(Math.random() * arrayCopy.length);
      result.push(arrayCopy[index]);
      arrayCopy.splice(index, 1);
    }

    return result;
  }

  handleDisconnect(client: Socket) {
    const { nickname, roomId }: { nickname: string, roomId: number } = client.data;
    const hasRoom = this.rooms.has(roomId);
    let roomInfo: RoomInfo;

    if (!roomId || !hasRoom) {
      return
    }
    roomInfo = this.rooms.get(roomId);
    roomInfo.players.delete(nickname)
    if (roomInfo.players.size === 0) {
      this.rooms.delete(roomId);
    }
    client.emit('event', '바윙~^^')
    client.leave(`${roomId}`);
    client.broadcast.to(`${roomId}`).emit('userLeaved', nickname);
    console.log(nickname, '이 잘 가고~')
    if (roomInfo.players.size === 0) {
      this.rooms.delete(roomId)
      clearInterval(this.roomTimers.get(roomId));
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
    console.log(nickname);
    const { roomId } = client.data;
    const roomInfo: RoomInfo = this.rooms.get(roomId);
    const target: string = roomInfo.players.get(nickname);
    client.to(target).emit('reqWorldInfo', '정보 내놔');
  }

  @SubscribeMessage('resWorldInfo')
  resWorldInfo() { } // @MessageBody() event: world, // @ConnectedSocket() client: Socket,

  @SubscribeMessage('gameOver')
  async gameOver(
    @ConnectedSocket() client: Socket,
    @MessageBody() isOver: boolean
  ) {
    const { roomId, nickname } = client.data
    const roomInfo: RoomInfo = this.rooms.get(roomId)

    // const score = roomInfo.scores.get(nickname);
    // const { data: result } = await axios.post('http://jeongminjo.shop:3000/user/score', {
    //   nickname,
    //   score
    // });
    // console.log(`점수 전송~ ${nickname}의 점수 ${score} 결과 : ${result}`)


    this.gameEnd(roomId, nickname);
  }

  gameEnd(roomId: number, nickname?: string) {
    const roomInfo: RoomInfo = this.rooms.get(roomId)
    if (nickname) {
      roomInfo.gameOver.add(nickname)
      console.log(roomInfo.gameOver)
    }

    if (roomInfo.gameOver.size === roomInfo.players.size) {
      clearInterval(this.roomTimers.get(roomId));
      this.server.to(`${roomId}`).emit('gameEnd', true)
      console.log('퇴출 시작', roomInfo.gameOver)
      const users = roomInfo.players.values()
      Array.from(users).forEach((user) => {
        const socket: Socket = this.server.sockets.sockets.get(user)
        socket.disconnect()
      })
    }
  }

  @SubscribeMessage('randomSpawn')
  randomSpawn(
    @ConnectedSocket() client: Socket,
    @MessageBody() block: string
  ) {
    const { roomId, nickname } = client.data
    client.broadcast.to(`${roomId}`).emit('nextBlock', {
      nickname,
      block
    });
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
    @MessageBody() item: number
  ) {
    const { roomId, nickname } = client.data;
    client.broadcast.to(`${roomId}`).emit('selectedItem', item);
    console.log(nickname, '<< 아이템 사용', item, '<<<');
  }


}

type world = {
  nickname: string;
  keyframe: number;
  serialize: Uint8Array;
};
