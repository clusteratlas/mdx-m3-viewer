/**
 * @class
 * @classdesc A BLP texture, used by Warcraft 3.
 * @extends Texture
 * @memberOf Blp
 * @param {ModelViewer} env The model viewer object that this model belongs to.
 * @param {function} pathSolver A function that solves paths. See more {@link PathSolver here}.
 */
function BlpTexture(env, pathSolver) {
    Texture.call(this, env, pathSolver);
}

BlpTexture.prototype = {
    get Handler() {
        return Blp;
    },

    initialize(src) {
        const gl = this.env.gl,
              BLP1_MAGIC = 0x31504c42,
              BLP_JPG = 0x0,
              BLP_PALLETE = 0x1;

        if (src.byteLength < 40) {
            this.onerror("InvalidSource", "FileTooSmall");
            return false;
        }

        const header = new Int32Array(src, 0, 39);

        if (header[0] !== BLP1_MAGIC) {
            this.onerror("InvalidSource", "WrongMagicNumber");
            return false;
        }

        const arrayData = new Uint8Array(src),
            content = header[1],
            alphaBits = header[2],
            width = header[3],
            height = header[4],
            mipmapOffset = header[7],
            mipmapSize = header[23],
            imageData = new ImageData(width, height);

        if (content === BLP_JPG) {
            let jpegHeaderSize = new Uint32Array(src, 39 * 4, 1)[0],
                jpegHeader = new Uint8Array(src, 160, jpegHeaderSize),
                jpegData = new Uint8Array(jpegHeaderSize + mipmapSize);

            jpegData.set(jpegHeader);
            jpegData.set(arrayData.subarray(mipmapOffset, mipmapOffset + mipmapSize), jpegHeaderSize);

            const jpegImage = new JpegImage();

            jpegImage.loadFromBuffer(jpegData);

            jpegImage.getData(imageData, jpegImage.width, jpegImage.height);
        } else {
            let pallete = new Uint8Array(src, 156, 1024),
                size = width * height,
                mipmapAlphaOffset = mipmapOffset + size,
                bitBuffer,
                bitsToByte = 1 / alphaBits * 255

            if (alphaBits > 0) {
                bitBuffer = new BitBuffer(arrayData.buffer, mipmapAlphaOffset, Math.ceil((size * alphaBits) / 8));
            }

            for (let index = 0; index < size; index++) {
                let i = arrayData[mipmapOffset + index] * 4,
                    dstI = index * 4;

                imageData.data[dstI] = pallete[i];
                imageData.data[dstI + 1] = pallete[i + 1];
                imageData.data[dstI + 2] = pallete[i + 2];

                if (alphaBits > 0) {
                    imageData.data[dstI + 3] = readBits(bitBuffer, alphaBits) * bitsToByte;
                } else {
                    imageData.data[dstI + 3] = 255;
                }
            }
        }

        // NOTE: BGRA data, it gets sizzled in the shader
        const id = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, id);
        this.setParameters(gl.REPEAT, gl.REPEAT, gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        gl.generateMipmap(gl.TEXTURE_2D);

        this.width = width;
        this.height = height;
        this.imageData = imageData;
        this.webglResource = id;

        return true;
    }
};

mix(BlpTexture.prototype, Texture.prototype);
