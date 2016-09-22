function W3xMap(env, pathSolver) {
    GenericFile.call(this, env, pathSolver);
}

W3xMap.prototype = {
    get Handler() {
        return W3x;
    },

    initialize(src) {
        var reader = new BinaryReader(src);

        if (read(reader, 4) === "HM3W") {
            skip(reader, 4);

            this.name = readUntilNull(reader);
            this.flags = readInt32(reader);
            this.maxPlayers = readInt32(reader);

            this.mpq = new MpqArchive(this.env);
            this.mpq.initialize(src);

            console.log(this.mpq.getFileList());

            this.pathSolver = (path) => {
                if (this.mpq.hasFile(path)) {
                    return [this.mpq.getFile(path).buffer, true];
                }

                path = path.toLowerCase().replace(/\\/g, "/");

                if (window.location.hostname.match("hiveworkshop")) {
                    path = "http://www.hiveworkshop.com/mpq-contents/?path=" + path;
                } else {
                    path = "resources/warcraft/" + path;
                }

                return [path, path.substr(path.lastIndexOf(".")), true];
            };

            var paths = [
                "Doodads/Doodads.slk",
                "Doodads/DoodadMetaData.slk",
                "Units/DestructableData.slk",
                "Units/DestructableMetaData.slk",
                "Units/UnitData.slk",
                "Units/ItemData.slk",
                "Units/UnitMetaData.slk",
                "Units/unitUI.slk",
                "TerrainArt/Terrain.slk",
                "TerrainArt/CliffTypes.slk"];

            var files = this.loadFiles(paths);

            this.slkFiles = {};

            for (var i = 0, l = files.length; i < l; i++) {
                this.slkFiles[paths[i].substr(paths[i].lastIndexOf("/") + 1).toLowerCase().split(".")[0]] = files[i];
            }

            this.env.whenAllLoaded(files, () => {
                this.loadTerrain();
                //this.loadModifications();
                //this.loadDoodads();
                //this.loadUnits();
            });

            return true;
        } else {
            //auxiliaryFile.reject("Not a Warcraft 3 map");
            return false;
        }
    },

    loadFiles(src) {
        return this.env.load(src, this.pathSolver);
    },

    // Doodads and destructables
    loadDoodads() {
        var file = this.mpq.getFile("war3map.doo");

        if (file) {
            var reader = new BinaryReader(file.buffer);

            var id = read(reader, 4);
            var version = readInt32(reader);
            var something = readInt32(reader); // sub version?
            var objects = readInt32(reader);

            for (var i = 0; i < objects; i++) {
                new W3xDoodad(reader, version, this)
            }

            //*
            //skip(reader, 4);
    
            //var specialObjects = readInt32(reader);
    
            //for (var i = 0; i < specialObjects; i++) {
            //    new W3xSpecialDoodad(reader, version, this)
            //}
            //*/
        }
    },

    // Units and items
    loadUnits() {
        var file = this.mpq.getFile("war3mapUnits.doo");

        if (file) {
            var reader = new BinaryReader(file.buffer);

            var id = read(reader, 4);
            var version = readInt32(reader);
            var something = readInt32(reader); // sub version?
            var objects = readInt32(reader);

            for (var i = 0; i < objects; i++) {
                new W3xUnit(reader, version, this);
            }
        }
    },

    heightAt(location) {
        var heightMap = this.heightMap,
            offset = this.offset,
            x = (location[0] / 128) + offset[0],
            y = (location[1] / 128) + offset[1];

        var minY = Math.floor(y),
            maxY = Math.ceil(y),
            minX = Math.floor(x),
            maxX = Math.ceil(x);

        // See if this coordinate is in the map
        if (maxY > 0 && minY < heightMap.length - 1 && maxX > 0 && minX < heightMap[0].length - 1) {
            // See http://gamedev.stackexchange.com/a/24574
            var triZ0 = heightMap[minY][minX],
                triZ1 = heightMap[minY][maxX],
                triZ2 = heightMap[maxY][minX],
                triZ3 = heightMap[maxY][maxX],
                sqX = x - minX,
                sqZ = y - minY,
                height;

            if ((sqX + sqZ) < 1) {
                height = triZ0 + (triZ1 - triZ0) * sqX + (triZ2 - triZ0) * sqZ;
            } else {
                height = triZ3 + (triZ1 - triZ3) * (1 - sqZ) + (triZ2 - triZ3) * (1 - sqX);
            }

            return height * 128;
        }

        return 0;
    },

    loadTerrain() {
        var file = this.mpq.getFile("war3map.w3e");

        if (file) {
            var reader = new BinaryReader(file.buffer);

            var id = read(reader, 4);
            var version = readInt32(reader);
            var tileset = read(reader, 1);
            var haveCustomTileset = readInt32(reader);
            var groundTilesetCount = readInt32(reader);
            var groundTilesets = [];

            for (var i = 0; i < groundTilesetCount; i++) {
                groundTilesets[i] = read(reader, 4);
            }

            var cliffTilesetCount = readInt32(reader);
            var cliffTilesets = [];

            for (var i = 0; i < cliffTilesetCount; i++) {
                cliffTilesets[i] = read(reader, 4);
            }

            var mapSize = readInt32Array(reader, 2);
            var centerOffset = readFloat32Array(reader, 2);

            var tilepoints = [];
            var heightMap = [];

            for (var y = 0; y < mapSize[1]; y++) {
                tilepoints[y] = [];
                heightMap[y] = [];

                for (var x = 0; x < mapSize[0]; x++) {
                    tilepoints[y][x] = new W3xTilePoint(reader);
                    heightMap[y][x] = tilepoints[y][x].getHeight();
                }
            }

            this.mapSize = mapSize;
            this.offset = [-centerOffset[0] / 128, -centerOffset[1] / 128];
            this.tilepoints = tilepoints;
            this.heightMap = heightMap;

            var slk = this.slkFiles.terrain;

            this.tilesetTextures = [];

            // Avoid creating mipmaps, since they create endless bleeding in the texture atlases
            var gl = this.env.gl;

            for (var i = 0, l = groundTilesets.length; i < l; i++) {
                var row = slk.getRow(groundTilesets[i]) ;

                this.tilesetTextures.push(this.loadFiles(row.dir + "\\" + row.file + ".blp"));
            }

            var tilesetToBlight = {
                A: "Ashen",
                B: "Barrens",
                C: "Felwood",
                D: "Dungeon",
                F: "Lordf",
                G: "Lords", // Underground is what?
                L: "Lords",
                N: "North",
                Q: "VillageFall",
                V: "Village",
                W: "Lordw",
                X: "Lords", // Dalaran is what?
                Y: "Lords", // Cityscape is what?
                Z: "Lords", // Sunken ruins
                I: "Ice",
                J: "DRuins",
                O: "Outland",
                K: "Citadel"
            };

            this.tilesetTextures.push(this.loadFiles("TerrainArt\\Blight\\" + tilesetToBlight[tileset] + "_Blight.blp"));

            this.blightTextureIndex = groundTilesetCount;

            let cliffSlk = this.slkFiles.clifftypes;

            //console.log(cliffTilesets)
            //console.log(slk)

            this.cliffs = [];
            this.cliffTextures = [];

            for (var i = 0, l = cliffTilesets.length; i < l; i++) {
                var row = cliffSlk.getRow(cliffTilesets[i]);

                //if (row) {
                    path = row.dir + "\\" + row.file + ".blp";

                    this.cliffs.push(row);
                    this.cliffTextures.push(this.loadFiles(path));
                //} else {
                //    console.warn("W3x: unknown tileset texture ID " + cliffTilesets[i]);
                //}
            }

            this.cliffTexturesOffset = groundTilesetCount + 1;

            this.env.whenAllLoaded(this.tilesetTextures, _ => {
                // Try to avoid texture atlas bleeding
                for (let texture of this.tilesetTextures) {
                    // To avoid WebGL errors if a texture failed to load
                    if (texture.loaded) {
                        gl.bindTexture(gl.TEXTURE_2D, texture.webglResource);
                        texture.setParameters(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.LINEAR, gl.LINEAR);
                    }
                }

                this.loadTerrainCliffs();
                //this.loadTerrainGeometry();
            });
        }
    },

    heightsToCliffTag(a, b, c, d) {
        const map = {
            0: "A",
            1: "B",
            2: "C"
        };

        return map[a] + map[b] + map[c] + map[d];
    },

    prepareTilePoints() {
        var mapSize = this.mapSize;
        var tilepoints = this.tilepoints;
        var centerOffset = this.offset;

        var xAxisModel = this.env.load({
            geometry: createUnitCube(),
            material: { renderMode: 2, color: [1, 0, 0], twoSided: true }
        }, src =>[src, ".geo", false]);

        var yAxisModel = this.env.load({
            geometry: createUnitCube(),
            material: { renderMode: 2, color: [0, 1, 0], twoSided: true }
        }, src =>[src, ".geo", false]);

        var zAxisModel = this.env.load({
            geometry: createUnitCube(),
            material: { renderMode: 2, color: [0, 0, 1], twoSided: true }
        }, src =>[src, ".geo", false]);

        var xAxis = xAxisModel.addInstance().scale([100, 8, 8]).move([100, 0, 0]);
        var yAxis = yAxisModel.addInstance().scale([8, 100, 8]).move([0, 100, 0]);
        var zAxis = zAxisModel.addInstance().scale([8, 8, 100]).move([0, 0, 100]);

        for (var y = 0; y < mapSize[1]; y++) {
            for (var x = 0; x < mapSize[0]; x++) {
                var tile = tilepoints[y][x];
                var L, R, B, T;
                var LTile, RTile, BTile, TTile;
                var cliffMask = 0;

                if (x > 0) {
                    tile.l = tilepoints[y][x - 1];
                    tile.dl = tile.layerHeight - tile.l.layerHeight;

                    if (tile.dl > 0) {
                        cliffMask |= 1;
                    }
                }

                if (x < mapSize[0] - 1) {
                    tile.r = tilepoints[y][x + 1];
                    tile.dr = tile.layerHeight - tile.r.layerHeight;

                    if (tile.dr > 0) {
                        cliffMask |= 2;
                    }
                }

                if (y > 0) {
                    tile.b = tilepoints[y - 1][x];
                    tile.db = tile.layerHeight - tile.b.layerHeight;

                    if (tile.db > 0) {
                        cliffMask |= 4;
                    }
                }

                if (y < mapSize[1] - 1) {
                    tile.t = tilepoints[y + 1][x];
                    tile.dt = tile.layerHeight - tile.t.layerHeight;

                    if (tile.dt > 0) {
                        cliffMask |= 8;
                    }
                }

                if (x > 0 && y > 0) {
                    tile.lb = tilepoints[y - 1][x - 1];
                    tile.dlb = tile.layerHeight - tile.lb.layerHeight;

                    if (tile.dlb > 0) {
                        cliffMask |= 16;
                    }
                }

                if (x < mapSize[0] - 1 && y > 0) {
                    tile.rb = tilepoints[y - 1][x + 1];
                    tile.drb = tile.layerHeight - tile.rb.layerHeight;

                    if (tile.drb > 0) {
                        cliffMask |= 32;
                    }
                }

                if (x > 0 && y < mapSize[1] - 1) {
                    tile.lt = tilepoints[y + 1][x - 1];
                    tile.dlt = tile.layerHeight - tile.lt.layerHeight;

                    if (tile.dlt > 0) {
                        cliffMask |= 64;
                    }
                }

                if (x < mapSize[0] - 1 && y < mapSize[1] - 1) {
                    tile.rt = tilepoints[y + 1][x + 1];
                    tile.drt = tile.layerHeight - tile.rt.layerHeight;

                    if (tile.drt > 0) {
                        cliffMask |= 128;
                    }
                }

                let locX = (x - centerOffset[0]) * 128,
                    locY = (y - centerOffset[1]) * 128,
                    locZ = tile.getCliffHeight(1) * 128;

                tile.x = locX;
                tile.y = locY;
                tile.z = locZ;

                if (cliffMask !== 0) {
                    tile.cliff = true;
                    tile.mask = cliffMask;
                }
            }
        }
    },

    loadTerrainCliffs() {
        this.prepareTilePoints();

        var mapSize = this.mapSize;
        var tilepoints = this.tilepoints;

        var xAxisModel = this.env.load({
            geometry: createUnitCube(),
            material: { renderMode: 2, color: [1, 0, 0], twoSided: true }
        }, src =>[src, ".geo", false]);

        var yAxisModel = this.env.load({
            geometry: createUnitCube(),
            material: { renderMode: 2, color: [0, 1, 0], twoSided: true }
        }, src =>[src, ".geo", false]);

        var zAxisModel = this.env.load({
            geometry: createUnitCube(),
            material: { renderMode: 2, color: [0, 0, 1], twoSided: true }
        }, src =>[src, ".geo", false]);

        var xAxis = xAxisModel.addInstance().scale([100, 8, 8]).move([100, 0, 0]);
        var yAxis = yAxisModel.addInstance().scale([8, 100, 8]).move([0, 100, 0]);
        var zAxis = zAxisModel.addInstance().scale([8, 8, 100]).move([0, 0, 100]);

        for (var y = 0; y < mapSize[1]; y++) {
            for (var x = 0; x < mapSize[0]; x++) {
                var tile = tilepoints[y][x];

                //if (tile.whatIsThis) {
                    //yAxisModel.addInstance().setLocation([locX, locY, locZ + 128]).uniformScale(32);
                //}

                if (!tile.cliff) {
                    xAxisModel.addInstance().setLocation([tile.x, tile.y, tile.z]).uniformScale(32);
                }

                if (tile.cliff) {
                    let variation = tile.variation;
                    let cliffRow = this.cliffs[tile.cliffTextureType];
                    let model, instance;

                    // A means height=0, B means height=1, C means height=2. The order is the corners.
                    // [RT, RB, LB, LT]
                    // The number is the variation (what selects this?)
                    
                    // The cliff type mask leads to way too many conditions.
                    // What if I make a smaller mask per corner of each tilepoint?
                    // This will also allow to ignore corners that are now placed multiple times in the same locations (e.g. two cliffs sharing a wall - both will have the wall spawned)
                    // E.g. for the left top corner, the mask needs the left/top left/top tiles


                    let LEFT = 1,
                        RIGHT = 2,
                        BOTTOM = 4,
                        TOP = 8,
                        LEFT_BOTTOM = 16,
                        RIGHT_BOTTOM = 32,
                        LEFT_TOP = 64,
                        RIGHT_TOP = 128;

                    function bitwiseNot(n) {
                        let uint = new Uint8Array(1);

                        uint[0] = n;
                        uint[0] = ~uint[0];

                        return uint[0];
                    }

                    

                    let CLIFF_TYPE_SINGLE_CLIFF = 255,
                        CLIFF_TYPE_LEFT = bitwiseNot(LEFT),
                        CLIFF_TYPE_RIGHT = bitwiseNot(RIGHT),
                        CLIFF_TYPE_BOTTOM = bitwiseNot(BOTTOM),
                        CLIFF_TYPE_TOP = bitwiseNot(TOP),
                        CLIFF_TYPE_LEFT_BOTTOM_CORNER = 117,
                        CLIFF_TYPE_BOTTOM_WALL = 52,
                        CLIFF_TYPE_RIGHT_BOTTOM_CORNER = 182,
                        CLIFF_TYPE_LEFT_WALL = 81,
                        CLIFF_TYPE_RIGHT_WALL = 162,
                        CLIFF_TYPE_LEFT_TOP_CORNER = 217,
                        CLIFF_TYPE_TOP_WALL = 200,
                        CLIFF_TYPE_RIGHT_TOP_CORNER = 234;
                        

                    if (tile.mask === CLIFF_TYPE_SINGLE_CLIFF) {
                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])
                    } else if (tile.mask === CLIFF_TYPE_LEFT) {
                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])
                    } else if (tile.mask === CLIFF_TYPE_RIGHT) {
                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])
                    } else if (tile.mask === CLIFF_TYPE_BOTTOM) {
                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])
                    } else if (tile.mask === CLIFF_TYPE_TOP) {
                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])
                    } else if (tile.mask === CLIFF_TYPE_LEFT_BOTTOM_CORNER) {
                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])

                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_RIGHT_BOTTOM_CORNER) {
                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_LEFT_TOP_CORNER) {
                        // Left bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])

                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_RIGHT_TOP_CORNER) {
                        // Left top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z])

                        // Right top
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        // Right bottom
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_BOTTOM_WALL) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_LEFT_WALL) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_RIGHT_WALL) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    } else if (tile.mask === CLIFF_TYPE_TOP_WALL) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z]);
                    } else {
                        if (tile.mask === 51) {
                            zAxisModel.addInstance().setLocation([tile.x, tile.y, tile.z]).uniformScale(40);
                        }

                        yAxisModel.addInstance().setLocation([tile.x, tile.y, tile.z]).uniformScale(32);

                        console.warn("Unhandled cliff mask", tile.mask)
                    }

                    // Right top
                    /*
                    if (R > 0 && T > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(cliffHeight, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([locX + 128, locY, locZ]);
                    } else if (T > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(cliffHeight, 0, 0, T) + "1.mdx");
                        instance = model.addInstance().setLocation([locX + 128, locY, locZ]);
                    } else if (R > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(cliffHeight, R, 0, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([locX + 128, locY, locZ]);
                    }
                    */

                    // Right bottom
                    /*
                    if (R > 0 && B > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, cliffHeight, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([locX + 128, locY - 128, locZ]);
                    } else if (B > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, cliffHeight, B, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([locX + 128, locY - 128, locZ]);
                    } else if (R > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(R, cliffHeight, 0, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([locX + 128, locY - 128, locZ]);
                    }

                    // Left bottom
                    if (L > 0 && B > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, cliffHeight, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([locX, locY - 128, locZ]);
                    } else if (B > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, B, cliffHeight, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([locX, locY - 128, locZ]);
                    } else if (L > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, cliffHeight, L) + "1.mdx");
                        instance = model.addInstance().setLocation([locX, locY - 128, locZ]);
                    }

                    // Left top
                    if (L > 0 && T > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, cliffHeight) + "0.mdx");
                        instance = model.addInstance().setLocation([locX, locY, locZ]);
                    } else if (T > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(T, 0, 0, cliffHeight) + "1.mdx");
                        instance = model.addInstance().setLocation([locX, locY, locZ]);
                    } else if (L > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, L, cliffHeight) + "1.mdx");
                        instance = model.addInstance().setLocation([locX, locY, locZ]);
                    }
                    */

                    /*
                    // Left wall
                    if (tile.top.cliff && tile.bottom.cliff && tile.left.layerHeight !== tile.layerHeight) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z]);
                    }

                    // Right wall
                    if (tile.top.cliff && tile.bottom.cliff && tile.right.layerHeight !== tile.layerHeight) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    }

                    // Top wall
                    if (tile.left.cliff && tile.right.cliff && tile.top.layerHeight !== tile.layerHeight) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 1) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z]);
                    }

                    // Bottom wall
                    if (tile.left.cliff && tile.right.cliff && tile.bottom.layerHeight !== tile.layerHeight) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);

                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 1, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);
                    }

                    // Left top corner
                    if (!tile.top.cliff && !tile.left.cliff) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z]);
                    }

                    // Right top corner
                    if (!tile.top.cliff && !tile.right.cliff) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(1, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    }

                    // Right bottom corner
                    if (!tile.bottom.cliff && !tile.right.cliff) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);
                    }

                    // Left bottom corner
                    if (!tile.bottom.cliff && !tile.left.cliff) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);
                    }
                    */
                    /*
                    if (tile.dR > 0 && tile.dT > 0 && tile.right.cliff) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(tile.cliffHeight, 0, 0, 1) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    } else if (tile.dR > 0 && tile.dT > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(tile.cliffHeight, 0, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y, tile.z]);
                    }

                    if (tile.dR > 0 && tile.dB > 0 && tile.right.cliff) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, tile.cliffHeight, 1, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);
                    } else if (tile.dR > 0 && tile.dB > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, tile.cliffHeight, 0, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x + 128, tile.y - 128, tile.z]);
                    }

                    if (tile.left.cliff) {
                        console.log("ASD")
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 1, tile.cliffHeight, 0) + "1.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);
                    } else if (tile.dL > 0 && tile.dB > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, tile.cliffHeight, 0) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y - 128, tile.z]);
                    }

                    if (tile.dL > 0 && tile.dT > 0) {
                        model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, 0, tile.cliffHeight) + "0.mdx");
                        instance = model.addInstance().setLocation([tile.x, tile.y, tile.z]);
                    }
                    */

                    //model = this.loadFiles("Doodads/Terrain/Cliffs/Cliffs" + this.heightsToCliffTag(0, 0, R, L) + "0.mdx");
                    //instance = model.addInstance().setLocation([locX, locY, locZ]);
                }
            }
        }
    },

    getTileVariation(variation, isExtended) {
        if (isExtended) {
            switch (variation) {
                case 0: return [4, 0]
                case 1: return [5, 0]
                case 2: return [6, 0]
                case 3: return [7, 0]
                case 4: return [4, 1]
                case 5: return [5, 1]
                case 6: return [6, 1]
                case 7: return [7, 1]
                case 8: return [4, 2]
                case 9: return [5, 2]
                case 10: return [6, 2]
                case 11: return [7, 2]
                case 12: return [4, 3]
                case 13: return [5, 3]
                case 14: return [6, 3]
                case 15: return [7, 3]
                case 16: return [3, 3]
                case 17: return [0, 0]
                default: /*console.log("Unknown tile variation " + variation);*/ return [0, 0]
            }
        } else {
            if (variation === 1) {
                return [3, 3];
            } else {
                return [0, 0];
            }
        }
    },

    loadTerrainGeometry() {
        var tilesetTextures = this.tilesetTextures;
        var mapSize = this.mapSize;
        var tilepoints = this.tilepoints;
        var centerOffset = this.offset;

        var vertices = {};
        var uvs = {};
        var faces = {};
        var edges = {};
        
        var blightTextureIndex = this.blightTextureIndex;

        for (var y = 0; y < mapSize[1] - 1; y++) {
            for (var x = 0; x < mapSize[0] - 1; x++) {
                var tile1 = tilepoints[y][x],
                    tile2 = tilepoints[y + 1][x],
                    tile3 = tilepoints[y + 1][x + 1],
                    tile4 = tilepoints[y][x + 1],
                    texture1 = tile1.blight ? blightTextureIndex : tile1.groundTextureType,
                    texture2 = tile2.blight ? blightTextureIndex : tile2.groundTextureType,
                    texture3 = tile3.blight ? blightTextureIndex : tile3.groundTextureType,
                    texture4 = tile4.blight ? blightTextureIndex : tile4.groundTextureType;

                var textures = [texture1, texture2, texture3, texture4].unique();

                for (var texture = 0; texture < textures.length; texture++) {
                    var t = textures[texture];

                    if (!vertices[t]) {
                        vertices[t] = [];
                        uvs[t] = [];
                        faces[t] = [];
                        edges[t] = [];
                    }

                    var base = vertices[t].length / 3;

                    faces[t].push(base, base + 1, base + 2, base, base + 2, base + 3);
                    edges[t].push(base, base + 1, base + 1, base + 2, base + 2, base + 3, base + 3, base);
                    vertices[t].push(x, y, tile1.getHeight(), x, y + 1, tile2.getHeight(), x + 1, y + 1, tile3.getHeight(), x + 1, y, tile4.getHeight());

                    var extended = (tilesetTextures[t].width === 512);
                    var width = extended ? 1 / 8 : 1 / 4;
                    var height = 1 / 4;
                    var offsetX = 0;
                    var offsetY = 0;

                    if (t === texture1 && t === texture2 && t === texture3 && t === texture4) {
                        let variation = this.getTileVariation(tile1.variation, extended)
                        
                        offsetX = variation[0];
                        offsetY = variation[1];
                    } else if (t === texture1 && t === texture2 && t === texture3) {
                        if (t > texture4) {
                            offsetX = 2;
                            offsetY = 3;
                        }
                    } else if (t === texture2 && t === texture3 && t === texture4) {
                        if (t > texture1) {
                            offsetX = 1;
                            offsetY = 3;
                        }
                    } else if (t === texture3 && t === texture4 && t === texture1) {
                        if (t > texture2) {
                            offsetX = 3;
                            offsetY = 1;
                        }
                    } else if (t === texture4 && t === texture1 && t === texture2) {
                        if (t > texture3) {
                            offsetX = 3;
                            offsetY = 2;
                        }
                    } else if (t === texture1 && t === texture2) {
                        if (t > texture3 || t > texture4) {
                            offsetX = 2;
                            offsetY = 2;
                        }
                    } else if (t === texture2 && t === texture3) {
                        if (t > texture1 || t > texture4) {
                            offsetX = 0;
                            offsetY = 3;
                        }
                    } else if (t === texture3 && t === texture4) {
                        if (t > texture1 || t > texture2) {
                            offsetX = 1;
                            offsetY = 1;
                        }
                    } else if (t === texture4 && t === texture1) {
                        if (t > texture2 || t > texture3) {
                            offsetX = 3;
                            offsetY = 0;
                        }
                    } else if (t === texture1 && t === texture3) {
                        if (t > texture2 || t > texture4) {
                            offsetX = 2;
                            offsetY = 1;
                        }
                    } else if (t === texture2 && t === texture4) {
                        if (t > texture1 || t > texture3) {
                            offsetX = 1;
                            offsetY = 2;
                        }
                    } else if (t === texture1) {
                        if (t > texture2 || t > texture3 || t > texture4) {
                            offsetX = 2;
                            offsetY = 0;
                        }
                    } else if (t === texture2) {
                        if (t > texture1 || t > texture3 || t > texture4) {
                            offsetX = 0;
                            offsetY = 2;
                        }
                    } else if (t === texture3) {
                        if (t > texture1 || t > texture2 || t > texture4) {
                            offsetX = 0;
                            offsetY = 1;
                        }
                    } else if (t === texture4) {
                        if (t > texture1 || t > texture2 || t > texture3) {
                            offsetX = 1;
                            offsetY = 0;
                        }
                    }

                    offsetX *= width;
                    offsetY *= height;

                    // pixel correction, to avoid bleeding
                    var pixelSizeX = 1 / tilesetTextures[t].width;
                    var pixelSizeY = 1 / tilesetTextures[t].height;
                    offsetX += pixelSizeX;
                    offsetY += pixelSizeY;
                    width -= 2 * pixelSizeX;
                    height -= 2 * pixelSizeY;

                    uvs[t].push(offsetX, offsetY + height, offsetX, offsetY, offsetX + width, offsetY, offsetX + width, offsetY + height);
                }
            }
        }

        for (var i = 0, l = tilesetTextures.length; i < l; i++) {
            if (vertices[i]) {
                var v = new Float32Array(vertices[i]),
                    u = new Float32Array(uvs[i]),
                    f = new Uint32Array(faces[i]),
                    e = new Uint32Array(edges[i]),
                    t = tilesetTextures[i];

                var terrainModel = this.env.load({
                    geometry: { vertices: v, uvs: u, faces: f, edges: e },
                    material: { renderMode: 0, twoSided: true, texture: t, isBGR: true, isBlended: true }
                }, src =>[src, ".geo", false]);
                var instance = terrainModel.addInstance();
                instance.setUniformScale(128).setLocation([-centerOffset[0] * 128, -centerOffset[1] * 128, 0]);
                instance.noCulling = true;
            }
        }
    },

    loadModifications() {
        // useOptionalInts:
        //      w3u: no (units)
        //      w3t: no (items)
        //      w3b: no (destructables)
        //      w3d: yes (doodads)
        //      w3a: yes (abilities)
        //      w3h: no (buffs)
        //      w3q: yes (upgrades)

        var slkFiles = this.slkFiles;

        this.loadModificationFile("b", false, slkFiles.destructabledata, slkFiles.destructablemetadata);
        this.loadModificationFile("d", true, slkFiles.doodads, slkFiles.doodadmetadata);
        this.loadModificationFile("u", false, slkFiles.unitdata, slkFiles.unitmetadata);
    },

    loadModificationFile(file, useOptionalInts, dataTable, metadataTable) {
        var file = this.mpq.getFile("war3map.w3" + file);

        if (file) {
            var reader = new BinaryReader(file.buffer);

            var version = readInt32(reader);

            // Modifications to built-in objects
            var originalTable = new W3xModificationTable(reader, useOptionalInts);
            this.applyModificationTable(originalTable, dataTable, metadataTable);

            // Declarations of user-defined objects
            var customTable = new W3xModificationTable(reader, useOptionalInts);
            this.applyModificationTable(customTable, dataTable, metadataTable);
        }
    },

    applyModificationTable(modificationTable, dataTable, metadataTable) {
        var modifications = modificationTable.objects;

        for (var i = 0, l = modifications.length; i < l; i++) {
            this.applyModificationObject(modifications[i], dataTable, metadataTable);
        }
    },

    applyModificationObject(modification, dataTable, metadataTable) {
        var row;

        if (modification.newID !== "") {
            if (dataTable.map[modification.oldID]) {
                row = dataTable.map[modification.newID] = Object.copy(dataTable.map[modification.oldID]);
                row.ID = modification.newID;
            }
        } else {
            row = dataTable.map[modification.oldID];
        }

        var modifications = modification.modifications

        if (row) {
            for (var i = 0, l = modifications.length; i < l; i++) {
                this.applyModification(modifications[i], row, metadataTable);
            }
        } else {
            console.warn("[W3xMap:applyModificationObject] Undefined row for modification", modification);
        }
    },

    applyModification(modification, row, metadataTable) {
        var metadata = metadataTable.map[modification.id];

        if (metadata) {
            row[metadata.field] = modification.value;
        } else {
            console.warn("Unknown modification ID", modification.id);
        }
    }
};

mix(W3xMap.prototype, GenericFile.prototype);
