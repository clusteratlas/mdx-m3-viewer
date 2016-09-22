function MdxModel(env, pathSolver) {
    Model.call(this, env, pathSolver);
}

MdxModel.prototype = {
    get Handler() {
        return Mdx;
    },

    initialize(src) {
        var parser = MdxParser(new BinaryReader(src));

        if (!parser) {
            this.onerror("Failed to parse");
            return false;
        }

        var objects, i, l, j, k;
        var chunks = parser.chunks;

        this.parser = parser;
        this.name = chunks.MODL.name;
        this.sequences = [];
        this.textures = [];
        this.meshes = [];
        this.cameras = [];
        this.particleEmitters = [];
        this.particleEmitters2 = [];
        this.ribbonEmitters = [];
        this.boundingShapes = [];
        this.attachments = [];

        this.texturePaths = [];

        this.replaceables = [];

        this.textureAtlases = {};

        if (chunks.TEXS) {
            objects = chunks.TEXS.elements;

            for (i = 0, l = objects.length; i < l; i++) {
                this.loadTexture(objects[i], this.pathSolver);
            }
        }

        if (chunks.SEQS) {
            this.sequences = chunks.SEQS.elements;
        }

        if (chunks.GLBS) {
            this.globalSequences = chunks.GLBS.elements;
        }

        var nodes = parser.nodes;
        var pivots;

        if (chunks.PIVT) {
            pivots = chunks.PIVT.elements;
        } else {
            pivots = [[0, 0, 0]];
        }

        this.nodes = [];
        this.sortedNodes = [];

        for (i = 0, l = nodes.length; i < l; i++) {
            this.nodes[i] = new MdxNode(nodes[i], this, pivots);
        }

        if (this.nodes.length === 0) {
            this.nodes[0] = new MdxNode({ objectId: 0, parentId: 0xFFFFFFFF }, this, pivots);
        }

        // This list is used to access all the nodes in a loop while keeping the hierarchy in mind.
        this.hierarchy = this.setupHierarchy([], this.nodes, -1);

        for (i = 0, l = this.nodes.length; i < l; i++) {
            this.sortedNodes[i] = this.nodes[this.hierarchy[i]];
        }

        // Checks what sequences are variant or not
        this.setupVariants();

        if (chunks.BONE) {
            this.bones = chunks.BONE.elements;
        } else {
            // If there are no bones, reference the injected root node, since the shader requires at least one bone
            this.bones = [{ node: { objectId: 0, index: 0 } }];
        }

        this.textureAnimations = this.transformElements(chunks.TXAN, MdxTextureAnimation);

        if (chunks.MTLS) {
            objects = chunks.MTLS.elements;

            var materials = [];

            var layerId = 0;

            this.layers = [];

            for (i = 0, l = objects.length; i < l; i++) {
                var layers = objects[i].layers;

                materials[i] = [];

                for (j = 0, k = layers.length; j < k; j++) {
                    var layer = new MdxLayer(layers[j], layerId, objects[i].priorityPlane, this);

                    layerId += 1;

                    materials[i][j] = layer;
                    this.layers.push(layer);

                    this.setupVaryingTextures(layer);
                }
            }

            this.materials = materials;
        }

        this.geosetAnimations = this.transformElements(chunks.GEOA, MdxGeosetAnimation);

        if (chunks.GEOS) {
            var geosets = chunks.GEOS.elements,
                opaqueBatches = [],
                translucentBatches = [];
           
            var batchId = 0;

            for (i = 0, l = geosets.length; i < l; i++) {
                var geoset = geosets[i];
                var layers = materials[geoset.materialId];

                var mesh = new MdxGeoset(geoset, this.geosetAnimations);

                this.meshes.push(mesh);

                for (j = 0, k = layers.length; j < k; j++) {
                    layer = layers[j];

                    var batch = new MdxBatch(batchId, layer, mesh);

                    if (layer.filterMode < 2) {
                        opaqueBatches.push(batch);
                    } else {
                        translucentBatches.push(batch);
                    }

                    batchId += 1;
                }
            }

            translucentBatches.sort(function (a, b) {
                return a.layer.priorityPlane > b.layer.priorityPlane;
            });

            this.batches = opaqueBatches.concat(translucentBatches);
            this.opaqueBatches = opaqueBatches;
            this.translucentBatches = translucentBatches;

            //this.calculateExtent();
        } else {
            this.batches = [];
        }

        this.setupGeosets(this.meshes);

        this.cameras = this.transformElements(chunks.CAMS, MdxCamera);

        if (chunks.PREM) {
            this.particleEmitters = chunks.PREM.elements;
        }

        if (chunks.PRE2) {
            this.particleEmitters2 = this.transformElements(chunks.PRE2, MdxParticleEmitter2);
        }

        if (chunks.RIBB) {
            this.ribbonEmitters = chunks.RIBB.elements;
        }

        this.boundingShapes = [];
        if (chunks.CLID) {
            this.boundingShapes = chunks.CLID.elements;
        }

        //this.boundingShapes = this.transformElements(chunks.CLID, MdxCollisionShape, gl);
        this.attachments = this.transformElements(chunks.ATCH, MdxAttachment);

        if (chunks.EVTS) {
            this.eventObjects = chunks.EVTS.elements;
        }


        this.calculateExtent();

        return true;
    },

    isVariant(sequence) {
        var nodes = this.nodes;

        for (var i = 0, l = nodes.length; i < l; i++) {
            if (nodes[i].isVariant(sequence)) {
                return true;
            }
        }
        
        return false;
    },

    setupVariants() {
        var sequences = this.sequences,
            variants = [];

        for (var i = 0, l = sequences.length; i < l; i++) {
            variants[i] = this.isVariant(i);
        }

        this.variants = variants;
    },

    setupVaryingTextures(layer) {
        var textureIds = layer.getAllTextureIds();

        if (textureIds.length > 1) {
            var hash = Array.hashCode(textureIds);
            var textures = [];

            for (var i = 0, l = textureIds.length; i < l; i++) {
                textures[i] = this.textures[textureIds[i]];
            }
            
            this.env.whenAllLoaded(textures, _ => {
                if (!this.textureAtlases[hash]) {
                    var images = [];

                    for (var i = 0, l = textures.length; i < l; i++) {
                        images[i] = textures[i].imageData;
                    }

                    var atlasData = createTextureAtlas(images);

                    var texture = this.env.load(atlasData.texture);

                    this.textureAtlases[hash] = { textureId: this.textures.length, columns: atlasData.columns, rows: atlasData.rows };
                    this.textures.push(texture);
                }

                var atlas = this.textureAtlases[hash];

                layer.textureId = atlas.textureId;
                layer.uvDivisor[0] = atlas.columns;
                layer.uvDivisor[1] = atlas.rows;
                layer.isTextureAnim = true;
            });
        }
    },

    setupGeosets(geosets) {
        if (geosets.length > 0) {
            var i, l;
            var gl = this.gl;
            var shallowGeosets = [];
            var geosetData;
            var arrayTypedArrays = [];
            var totalArrayOffset = 0;
            var elementTypedArrays = [];
            var totalElementOffset = 0;

            for (i = 0, l = geosets.length; i < l; i++) {
                var geoset = geosets[i],
                    vertices = geoset.locationArray,
                    normals = geoset.normalArray,
                    uvSets = geoset.uvsArray,
                    boneIndices = geoset.boneIndexArray,
                    boneNumbers = geoset.boneNumberArray,
                    faces = geoset.faceArray,
                    edges = geoset.edgeArray,
                    uvSetSize = geoset.uvSetSize,
                    verticesOffset = totalArrayOffset,
                    normalsOffset = verticesOffset + vertices.byteLength,
                    uvSetsOffset = normalsOffset + normals.byteLength,
                    boneIndicesOffset = uvSetsOffset + uvSets.byteLength,
                    boneNumbersOffset = boneIndicesOffset + boneIndices.byteLength,
                    facesOffset = totalElementOffset,
                    arraySize = boneNumbersOffset + boneNumbers.byteLength,
                    elementSize = faces.byteLength;

                shallowGeosets[i] = new MdxShallowGeoset([verticesOffset, normalsOffset, uvSetsOffset, boneIndicesOffset, boneNumbersOffset, totalElementOffset], uvSetSize, faces.length, this);

                totalArrayOffset = arraySize;
                totalElementOffset += elementSize;

                arrayTypedArrays.push([verticesOffset, vertices]);
                arrayTypedArrays.push([normalsOffset, normals]);
                arrayTypedArrays.push([uvSetsOffset, uvSets]);
                arrayTypedArrays.push([boneIndicesOffset, boneIndices]);
                arrayTypedArrays.push([boneNumbersOffset, boneNumbers]);

                elementTypedArrays.push([facesOffset, faces]);
            }

            var arrayBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, totalArrayOffset, gl.STATIC_DRAW);

            for (i = 0, l = arrayTypedArrays.length; i < l; i++) {
                gl.bufferSubData(gl.ARRAY_BUFFER, arrayTypedArrays[i][0], arrayTypedArrays[i][1]);
            }

            var faceBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faceBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, totalElementOffset, gl.STATIC_DRAW);

            for (i = 0, l = elementTypedArrays.length; i < l; i++) {
                gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, elementTypedArrays[i][0], elementTypedArrays[i][1]);
            }

            this.__webglArrayBuffer = arrayBuffer;
            this.__webglElementBuffer = faceBuffer;
            this.shallowGeosets = shallowGeosets;
        }
    },

    setupHierarchy(hierarchy, nodes, parent) {
        var node;

        for (var i = 0, l = nodes.length; i < l; i++) {
            node = nodes[i];

            if (node.parentId === parent) {
                hierarchy.push(i);

                this.setupHierarchy(hierarchy, nodes, node.objectId);
            }
        }

        return hierarchy;
    },

    transformElements(chunk, Func, gl) {
        var output = [];

        if (chunk) {
            var elements = chunk.elements;
            

            for (var i = 0, l = elements.length; i < l; i++) {
                output[i] = new Func(elements[i], this);
            }
        }

        return output;
    },

    loadTexture(texture, pathSolver) {
        var path = texture.path;
        var replaceableId = texture.replaceableId;

        if (replaceableId !== 0) {
            path = "replaceabletextures/" + MdxReplaceableIdToName[replaceableId] + ".blp";
        }

        this.replaceables.push(replaceableId);

        this.textures.push(this.env.load(path, pathSolver));
        this.texturePaths.push(path);
    },

    calculateExtent() {
        var meshes = this.meshes;
        var mesh;
        var min, max;
        var x, y, z;
        var minX = 1E9, minY = 1E9, minZ = 1E9;
        var maxX = -1E9, maxY = -1E9, maxZ = -1E9;
        var dX, dY, dZ;
        var i, l;

        for (i = 0, l = meshes.length; i < l; i++) {
            mesh = meshes[i];
            mesh.calculateExtent();

            min = mesh.extent.min;
            max = mesh.extent.max;
            x = min[0];
            y = min[1];
            z = min[2];

            if (x < minX) {
                minX = x;
            }

            if (y < minY) {
                minY = y;
            }

            if (z < minZ) {
                minZ = z;
            }

            x = max[0];
            y = max[1];
            z = max[2];

            if (x > maxX) {
                maxX = x;
            }

            if (y > maxY) {
                maxY = y;
            }

            if (z > maxZ) {
                maxZ = z;
            }
        }

        dX = maxX - minX;
        dY = maxY - minY;
        dZ = maxZ - minZ;

        this.extent = {radius: Math.sqrt(dX * dX + dY * dY + dZ * dZ) / 2, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
    },

    update() {
        if (!window.oops) {
            window.oops = 1;

            console.warn("[MdxModel.update] Do I really want this stuff here?");
        }

        Model.prototype.update.call(this);

        let emitters = this.particleEmitters2;
        if (emitters) {
            for (let i = 0, l = emitters.length; i < l; i++) {
                emitters[i].update();
            }
        }
    },

    bind(bucket) {
        const webgl = this.env.webgl;
        var gl = this.gl;

        // HACK UNTIL I IMPLEMENT MULTIPLE SHADERS AGAIN
        var shader = Mdx.standardShader;
        webgl.useShaderProgram(shader);
        this.shader = shader;

        const instancedArrays = gl.extensions.instancedArrays;
        const attribs = shader.attribs;
        const uniforms = shader.uniforms;

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.__webglElementBuffer);

        gl.uniformMatrix4fv(uniforms.get("u_mvp"), false, this.env.camera.worldProjectionMatrix);

        gl.uniform1i(uniforms.get("u_texture"), 0);

        // Team colors
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.teamColorBuffer);
        gl.vertexAttribPointer(attribs.get("a_teamColor"), 1, gl.UNSIGNED_BYTE, false, 1, 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_teamColor"), 1);

        // Tint colors
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.tintColorBuffer);
        gl.vertexAttribPointer(attribs.get("a_tintColor"), 3, gl.UNSIGNED_BYTE, true, 3, 0); // normalize the colors from [0, 255] to [0, 1] here instead of in the pixel shader
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_tintColor"), 1);

        gl.activeTexture(gl.TEXTURE15);
        gl.bindTexture(gl.TEXTURE_2D, bucket.boneTexture);
        gl.uniform1i(uniforms.get("u_boneMap"), 15);
        gl.uniform1f(uniforms.get("u_vector_size"), bucket.vectorSize);
        gl.uniform1f(uniforms.get("u_matrix_size"), bucket.matrixSize);
        gl.uniform1f(uniforms.get("u_row_size"), bucket.rowSize);

        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.instanceIdBuffer);
        gl.vertexAttribPointer(attribs.get("a_InstanceID"), 1, gl.UNSIGNED_SHORT, false, 2, 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_InstanceID"), 1);
    },

    unbind() {
        const gl = this.gl;
        const instancedArrays = gl.extensions.instancedArrays;
        const attribs = this.shader.attribs;

        // Reset gl values to default, to play nice with other handlers
        gl.depthMask(1);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        /// Reset the attributes to play nice with other handlers
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_teamColor"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_tintColor"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_InstanceID"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_batchVisible"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_geosetColor"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_uvOffset"), 0);
    },

    renderBatch(bucket, batch) {
        var gl = this.gl;
        const instancedArrays = gl.extensions.instancedArrays;
        var shader = this.shader;
        const attribs = this.shader.attribs;
        const uniforms = shader.uniforms;
        var layer = batch.layer;
        var shallowGeoset = this.shallowGeosets[batch.geoset.index];

        layer.bind(shader);

        var replaceable = this.replaceables[layer.textureId];

        // Team color
        if (replaceable === 1) {
            gl.uniform1i(uniforms.get("u_isTeamColor"), 1);
            gl.uniform1i(uniforms.get("u_isTeamGlow"), 0);
            // Team glow
        } else if (replaceable === 2) {
            gl.uniform1i(uniforms.get("u_isTeamColor"), 0);
            gl.uniform1i(uniforms.get("u_isTeamGlow"), 1);
            // Normal texture
        } else {
            gl.uniform1i(uniforms.get("u_isTeamColor"), 0);
            gl.uniform1i(uniforms.get("u_isTeamGlow"), 0);

            this.bindTexture(layer.textureId, bucket.modelView);
        }
        
        // Batch visibilities
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.batchVisibilityBuffers[batch.index]);
        gl.vertexAttribPointer(attribs.get("a_batchVisible"), 1, gl.UNSIGNED_BYTE, false, 1, 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_batchVisible"), 1);

        // Geoset colors
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.geosetColorBuffers[batch.index]);
        gl.vertexAttribPointer(attribs.get("a_geosetColor"), 4, gl.UNSIGNED_BYTE, true, 4, 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_geosetColor"), 1);

        // Texture coordinate animations
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.uvOffsetBuffers[layer.index]);
        gl.vertexAttribPointer(attribs.get("a_uvOffset"), 4, gl.FLOAT, false, 16, 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_uvOffset"), 1);

        // Texture coordinate divisor
        // Used for layers that use image animations, in order to scale the coordinates to match the generated texture atlas
        gl.uniform2f(uniforms.get("u_uvScale"), 1 / layer.uvDivisor[0], 1 / layer.uvDivisor[1]);

        // Does this layer use texture animations with multiple textures?
        gl.uniform1f(uniforms.get("u_isTextureAnim"), layer.isTextureAnim);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.__webglArrayBuffer);

        shallowGeoset.bind(shader, layer.coordId);

        shallowGeoset.render(bucket.instances.length);
    },

    renderBatches(bucket, batches) {
        if (batches && batches.length) {
            const updateBatches = bucket.updateBatches;

            this.bind(bucket);

            for (let i = 0, l = batches.length; i < l; i++) {
                const batch = batches[i];

                if (updateBatches[batch.index]) {
                    this.renderBatch(bucket, batch);
                }
            }

            this.unbind();
        }
    },

    renderOpaque(bucket) {
        this.renderBatches(bucket, this.opaqueBatches);
    },

    renderTranslucent(bucket) {
        this.renderBatches(bucket, this.translucentBatches);
    },

    renderEmitters(bucket) {
        let webgl = this.env.webgl,
            gl = this.env.gl,
            emitters;

        emitters = this.particleEmitters2;
        if (emitters.length) {
            gl.depthMask(0);
            gl.enable(gl.BLEND);
            gl.disable(gl.CULL_FACE);

            var shader = Mdx.particleShader;
            webgl.useShaderProgram(shader);

            gl.uniformMatrix4fv(shader.uniforms.get("u_mvp"), false, this.env.camera.worldProjectionMatrix);

            gl.uniform1i(shader.uniforms.get("u_texture"), 0);


            for (let i = 0, l = emitters.length; i < l; i++) {
                emitters[i].render(shader);
            }

            gl.depthMask(1);
        }

        gl.depthMask(1);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);

        /*
        var viewer = instance.asyncInstance.viewer;
        var gl = viewer.gl;
        var ctx = gl.ctx;
        var i, l;
        var sequence = instance.sequence;
        var frame = instance.frame;
        var counter = instance.counter;
        var shader;

        if (instance.ribbonEmitters && gl.shaderStatus("wribbons")) {
            ctx.depthMask(1);
            ctx.disable(ctx.CULL_FACE);

            shader = gl.bindShader("wribbons");
            ctx.uniformMatrix4fv(shader.variables.u_mvp, false, gl.getViewProjectionMatrix());
            ctx.uniform1i(shader.variables.u_texture, 0);

            for (i = 0, l = instance.ribbonEmitters.length; i < l; i++) {
                instance.ribbonEmitters[i].render(, instance.textureMap, shader, viewer);
            }
        }
        */
    },

    bindTexture(textureId, view) {
        let texture;

        if (view) {
            texture = view.textures[textureId];
        }

        if (!texture) {
            texture = this.textures[textureId];
        }

        this.env.webgl.bindTexture(texture, 0);
    },
};

mix(MdxModel.prototype, Model.prototype);