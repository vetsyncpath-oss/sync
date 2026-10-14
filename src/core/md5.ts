/** Drive's binary checksum, used for transfer verification, never as an authentication primitive. */
export function md5Hex(input: ArrayBuffer): string {
    const length = input.byteLength, size = Math.ceil((length + 9) / 64) * 64;
    const padded = new Uint8Array(size); padded.set(new Uint8Array(input)); padded[length] = 128;
    const view = new DataView(padded.buffer), bits = length * 8;
    view.setUint32(size - 8, bits >>> 0, true); view.setUint32(size - 4, Math.floor(bits / 2 ** 32), true);
    const shifts = [[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]];
    let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    for (let offset = 0; offset < size; offset += 64) {
        let a = a0, b = b0, c = c0, d = d0;
        for (let i = 0; i < 64; i++) {
            let f: number, g: number;
            if (i < 16) { f = (b & c) | (~b & d); g = i; }
            else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
            else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
            else { f = c ^ (b | ~d); g = 7 * i % 16; }
            const sum = (a + f + (Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0) + view.getInt32(offset + g * 4, true)) | 0;
            const shift = shifts[i >>> 4][i % 4], next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
            a = d; d = c; c = b; b = next;
        }
        a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }
    const result = new DataView(new ArrayBuffer(16)); [a0,b0,c0,d0].forEach((n,i) => result.setInt32(i * 4,n,true));
    return [...new Uint8Array(result.buffer)].map(n => n.toString(16).padStart(2,'0')).join('');
}
