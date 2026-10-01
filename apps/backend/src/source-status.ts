import dgram from "node:dgram";

function splitAddress(address: string) {
  const ipv6 = /^\[([^\]]+)](?::(\d+))?$/.exec(address);
  if (ipv6) return { host: ipv6[1], port: Number(ipv6[2] ?? 27015) };
  const separator = address.lastIndexOf(":");
  if (separator > -1 && /^\d+$/.test(address.slice(separator + 1))) {
    return { host: address.slice(0, separator), port: Number(address.slice(separator + 1)) };
  }
  return { host: address, port: 27015 };
}

function cString(buffer: Buffer, offset: number) {
  const end = buffer.indexOf(0, offset);
  if (end < 0) throw new Error("Invalid Source response");
  return { value: buffer.subarray(offset, end).toString("utf8"), next: end + 1 };
}

export interface SourceStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  map?: string;
  serverName?: string;
}

export function parseSourceInfo(message: Buffer): SourceStatus {
  if (message.length < 6 || message.readInt32LE(0) !== -1 || message[4] !== 0x49) throw new Error("Invalid Source response");
  let offset = 6;
  const name = cString(message, offset); offset = name.next;
  const map = cString(message, offset); offset = map.next;
  const folder = cString(message, offset); offset = folder.next;
  const game = cString(message, offset); offset = game.next;
  if (offset + 5 > message.length) throw new Error("Truncated Source response");
  offset += 2;
  const players = message[offset++];
  const maxPlayers = message[offset++];
  return { online: true, players, maxPlayers, map: map.value, serverName: name.value };
}

export async function querySource(address: string): Promise<SourceStatus> {
  const { host, port } = splitAddress(address);
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let finished = false;
    let challenged = false;
    const done = (value: SourceStatus = { online: false, players: 0, maxPlayers: 0 }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const request = (challenge?: Buffer) => {
      const base = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from("Source Engine Query\0", "ascii")]);
      socket.send(challenge ? Buffer.concat([base, challenge]) : base, port, host);
    };
    const timer = setTimeout(() => done(), 2_000);
    socket.on("error", () => done());
    socket.on("message", (message) => {
      try {
        if (message.length < 6 || message.readInt32LE(0) !== -1) return done();
        const type = message[4];
        if (type === 0x41 && !challenged && message.length >= 9) {
          challenged = true;
          request(message.subarray(5, 9));
          return;
        }
        if (type !== 0x49) return done();
        done(parseSourceInfo(message));
      } catch { done(); }
    });
    request();
  });
}
