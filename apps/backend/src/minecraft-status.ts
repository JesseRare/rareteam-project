import net from "node:net";

function varInt(value: number) {
  const bytes: number[] = [];
  do { let current = value & 0x7f; value >>>= 7; if (value) current |= 0x80; bytes.push(current); } while (value);
  return Buffer.from(bytes);
}

function mcString(value: string) {
  const data = Buffer.from(value, "utf8");
  return Buffer.concat([varInt(data.length), data]);
}

function readVarInt(data: Buffer, start = 0) {
  let value = 0; let size = 0; let byte = 0;
  do {
    if (start + size >= data.length || size >= 5) throw new Error("Invalid VarInt");
    byte = data[start + size]; value |= (byte & 0x7f) << (7 * size); size++;
  } while (byte & 0x80);
  return { value, size };
}

function splitAddress(address: string) {
  const ipv6 = /^\[([^\]]+)](?::(\d+))?$/.exec(address);
  if (ipv6) return { host: ipv6[1], port: Number(ipv6[2] ?? 25565) };
  const separator = address.lastIndexOf(":");
  if (separator > -1 && /^\d+$/.test(address.slice(separator + 1))) return { host: address.slice(0, separator), port: Number(address.slice(separator + 1)) };
  return { host: address, port: 25565 };
}

export async function queryMinecraft(address: string): Promise<{ online: boolean; players: number; maxPlayers: number }> {
  const { host, port } = splitAddress(address);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let finished = false;
    const done = (value = { online: false, players: 0, maxPlayers: 0 }) => {
      if (finished) return; finished = true; socket.destroy(); resolve(value);
    };
    socket.setTimeout(2000, () => done());
    socket.on("error", () => done());
    socket.on("connect", () => {
      const portBytes = Buffer.allocUnsafe(2); portBytes.writeUInt16BE(port);
      const body = Buffer.concat([varInt(0), varInt(767), mcString(host), portBytes, varInt(1)]);
      socket.write(Buffer.concat([varInt(body.length), body, Buffer.from([1, 0])]));
    });
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      try {
        const data = Buffer.concat(chunks);
        const frame = readVarInt(data);
        if (data.length < frame.size + frame.value) return;
        let offset = frame.size;
        const packet = readVarInt(data, offset); offset += packet.size;
        if (packet.value !== 0) return done();
        const length = readVarInt(data, offset); offset += length.size;
        const status = JSON.parse(data.subarray(offset, offset + length.value).toString("utf8")) as { players?: { online?: number; max?: number } };
        done({ online: true, players: status.players?.online ?? 0, maxPlayers: status.players?.max ?? 0 });
      } catch { done(); }
    });
  });
}
