function viewSize(width, height) {
  gl["viewport"](0, 0, width, height);
}

function setPerspective(fovy, aspect, near, far) {
  math.mat4.makePerspective(projectionMatrix, fovy, aspect, near, far);
}
/*
function setOrtho(left, right, bottom, top, near, far) {
  math.mat4.makeOrtho(projectionMatrix, left, right, bottom, top, near, far);
}

function setBackground(red, green, blue) {
  gl["clearColor"](red, green, blue, 1);
}
*/
function loadIdentity() {
  viewMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function translate(x, y, z) {
  math.mat4.translate(viewMatrix, x, y, z);
}

function rotate(angle, x, y, z) {
  math.mat4.rotate(viewMatrix, angle, x, y, z);
}

function scale(x, y, z) {
  math.mat4.scale(viewMatrix, x, y, z);
}

function lookAt(eye, center, up) {
  math.mat4.makeLookAt(viewMatrix, eye, center, up);
}

function multMat(mat) {
  math.mat4.multMat(viewMatrix, mat, viewMatrix);
}

function pushMatrix() {
  matrixStack.push(Object.copy(viewMatrix));
}

function popMatrix() {
  viewMatrix = matrixStack.pop();
}

function newShaderUnit(source, type, name) {
  var hash = String.hashCode(source);
  
  if (!shaderUnitStore[hash]) {
    shaderUnitStore[hash] = new ShaderUnit(source, type, name);
  }
  
  return shaderUnitStore[hash];
}

function newShader(name, vertexSource, fragmentSource, defines) {
  if (!shaderStore[name]) {
    defines = defines || [];
    
    for (var i = 0; i < defines.length; i++) {
      defines[i] = "#define " + defines[i];
    }
    
    defines = defines.join("\n") + "\n";
    
    var vertexUnit = newShaderUnit(defines + vertexSource, gl["VERTEX_SHADER"], name);
    var fragmentUnit = newShaderUnit(defines + fragmentSource, gl["FRAGMENT_SHADER"], name);
    
    if (vertexUnit.ready && fragmentUnit.ready) {
      shaderStore[name] = new Shader(name, vertexUnit, fragmentUnit);
      shaderUniformStore[name] = {};
    } else {
      unboundonerror({isShader: true, name: name}, "Compile");
    }
  }
  
  if (!shaderStore[name] || !shaderStore[name].ready) {
    return false;
  }
  
  return shaderStore[name];
}

function shaderReady(name) {
  return shaderStore[name] && shaderStore[name].ready;
}

function ShaderUnit(source, type, name) {
  var id = gl["createShader"](type);
  
  this.source = source;
  this.type = type;
  this.id = id;
  
  gl["shaderSource"](id, source);
  gl["compileShader"](id);
  
  if (gl["getShaderParameter"](id, gl["COMPILE_STATUS"])) {
    this.ready = true;
  } else {
    console.warn(name, gl["getShaderInfoLog"](id));
    //console.log(source);
  }
}

function Shader(name, vertexUnit, fragmentUnit) {
  var id = gl["createProgram"]();
  
  this.name = name;
  this.vertexUnit = vertexUnit;
  this.fragmentUnit = fragmentUnit;
  this.id = id;
  
  gl["attachShader"](id, vertexUnit.id);
  gl["attachShader"](id, fragmentUnit.id);
  gl["linkProgram"](id);
  
  if (gl["getProgramParameter"](id, gl["LINK_STATUS"])) {
    this.uniforms = this.getParameters("Uniform", "UNIFORMS");
    this.attribs = this.getParameters("Attrib", "ATTRIBUTES");
    this.ready = true;
  } else {
    unboundonerror({isShader: true, name: name}, "Link");
  }
}

Shader.prototype = {
  getParameters: function (type, enumtype) {
    var id = this.id;
    var o = {};
      
    for (var i = 0, l = gl["getProgramParameter"](id, gl["ACTIVE_" + enumtype]); i < l; i++) {
      var v = gl["getActive" + type](id, i);
      var location = gl["get" + type + "Location"](id, v.name);
      
      o[v.name] = [location, v.type];
    }
    
    return o;
  },
  
  setParameter: function (name, value) {
    if (parameterMap) {
      var tokens = name.split(".");
      
      name = parameterMap[tokens[0]];
      
      if (tokens[1]) {
        name += "." + memberMap[tokens[1]];
      }
    }
    
    var uniform = this.uniforms[name];
    var location;
    
    if (uniform) {
      location = uniform[0];
      
      var typeFunc = glTypeToUniformType[uniform[1]];
      
      if (typeFunc[0] === 'M') {
        gl["uniform" + typeFunc](location, false, value);
      } else {
        gl["uniform" + typeFunc](location, value);
      }
    } else {
      location = gl["getUniformLocation"](this.id, name);
      
      // If the location exists, it means this name refers to a uniform array
      if (location) {
        // When accessing an active uniform array, the driver returns array_name[0]
        var arrayuniform = this.uniforms[name.match(/([\w]+)/)[1] + "[0]"];
        
        if (arrayuniform) {
          this.uniforms[name] = [location, arrayuniform[1]];
          
          // Now call this function again to run the actual binding.
          this.setParameter(name, value);
        }
      }
    }
  },
  
  getParameter: function (name) {
    if (parameterMap) {
      var tokens = name.split(".");
      
      name = parameterMap[tokens[0]]
      
      if (tokens[1]) {
        name += "." + memberMap[tokens[1]];
      }
    }
    
    return this.uniforms[name] || this.attribs[name];
  },
  
  bind: function () {
    if (this.ready) {
      gl["useProgram"](this.id);
      
      var attribs = this.attribs;
      var keys = Object.keys(attribs);
        
      for (var i = 0, l = keys.length; i < l; i++) {
        gl["enableVertexAttribArray"](attribs[keys[i]][0]);
      }
    }
  },
  
  unbind: function () {
    var attribs = this.attribs;
    var keys = Object.keys(attribs);
      
    for (var i = 0, l = keys.length; i < l; i++) {
      gl["disableVertexAttribArray"](attribs[keys[i]][0]);
    }
    
    gl["useProgram"](null);
  }
};

function bindShader(name) {
  var shader = shaderStore[name];
  
  if (shader && (!boundShader || boundShader.id !== shader.id)) {
    if (boundShader) {
      boundShader.unbind();
    }
    
    boundShaderName = name;
    boundShader = shader;
    boundShader.bind();
  }
}

function setParameter(name, value) {
  if (boundShader) {
    var oldValue = shaderUniformStore[boundShaderName][name];
    var shouldSet = false;
    
    if (oldValue) {
      var isArray = value instanceof Array;
      
      if (isArray) {
        if (!Array.equals(oldValue, value)) {
          shouldSet = true;
        }
      } else if (oldValue !== value) {
        shouldSet = true;
      }
    } else {
      shouldSet = true;
    }
    
    if (shouldSet) {
      shaderUniformStore[boundShaderName][name] = value;
      
      boundShader.setParameter(name, value);
    }
  }
}

function setShaderMaps(parameters, members) {
  parameterMap = parameters;
  memberMap = members;
}

function vertexAttribPointer(name, size, type, normalized, stride, pointer) {
  if (boundShader) {
    //console.log(name);
    gl["vertexAttribPointer"](boundShader.getParameter(name)[0], size, type, normalized, stride, pointer);
  }
}

function bindMVP(uniform) {
  if (boundShader) {
    math.mat4.multMat(projectionMatrix, viewMatrix, mvpMatrix);
    
    boundShader.setParameter(uniform, mvpMatrix);
  }
}

function getMVP() {
  math.mat4.multMat(projectionMatrix, viewMatrix, mvpMatrix);
  
  return mvpMatrix;
}

function bindProjection(uniform) {
  if (boundShader) {
    boundShader.setParameter(uniform, projectionMatrix);
  }
}

function getProjection() {
  return projectionMatrix;
}

function bindView(uniform) {
  if (boundShader) {
    boundShader.setParameter(uniform, viewMatrix);
  }
}

function getView() {
  return viewMatrix;
}

function newTexture(source) {
  if (!textureStore[source]) {
    var ext = getFileExtension(source).toLowerCase();
    
    onloadstart({isTexture: 1, source: source});
    
    if (ext === "dds") {
      textureStore[source] = new DDSTexture(source, onload, onerror, onprogress);
    //} else if (ext === "blp") {
    //  textureStore[source] = new BLPTexture(source, onload, onerror, onprogress);
    } else {
      textureStore[source] = new Texture(source, onload, onerror, onprogress);
    }
  }
  
  return textureStore[source];
}

function bindTexture(object, unit) {
  var finalTexture;
  
  if (object) {
    if (typeof object === "string") {
      var texture = textureStore[object];
      
      if (texture && texture.ready) {
        finalTexture = texture;
      }
    } else if (object.ready) {
      finalTexture = object;
    }
  }
  
  unit = unit || 0;
  
  // This happens if the texture doesn't exist, or if it exists but didn't finish loading yet, or if asked to unbind (the given object is null).
  if (!finalTexture) {
    boundTextures[unit] = null;
    
    gl["activeTexture"](gl["TEXTURE" + unit]);
    gl["bindTexture"](gl["TEXTURE_2D"], null);
  } else if (!boundTextures[unit] || boundTextures[unit].source !== finalTexture.source) {
    boundTextures[unit] = finalTexture;
    
    gl["activeTexture"](gl["TEXTURE" + unit]);
    gl["bindTexture"](gl["TEXTURE_2D"], finalTexture.id);
  } 
}

function textureReady(source) {
  return textureNameStore[source] === 1;
}

function Rectangle(x, y, z, hw, hh, stscale) {
  stscale = stscale || 1;
  
  this.buffer = gl["createBuffer"]();
  this.data = new Float32Array([
    x - hw, y - hh, z, 0, 1 * stscale,
    x + hw, y - hh, z, 1 * stscale, 1 * stscale,
    x - hw, y + hh, z, 0, 0,
    x + hw, y + hh, z, 1 * stscale, 0
  ]);
  
  gl["bindBuffer"](gl["ARRAY_BUFFER"], this.buffer);
  gl["bufferData"](gl["ARRAY_BUFFER"], this.data, gl["STATIC_DRAW"]);
}

Rectangle.prototype = {
  render: function () {
    if (boundShader) {
      gl["bindBuffer"](gl["ARRAY_BUFFER"], this.buffer);
      
      vertexAttribPointer("a_position", 3, gl["FLOAT"], false, 20, 0);
      vertexAttribPointer("a_uv", 2, gl["FLOAT"], false, 20, 12);
      
      gl["drawArrays"](gl["TRIANGLE_STRIP"], 0, 4);
    }
  }
};

function Sphere(x, y, z, latitudeBands, longitudeBands, radius) {
  var vertexData = [];
  var indexData = [];
  var latNumber;
  var longNumber;
  
  for (latNumber = 0; latNumber <= latitudeBands; latNumber++) {
    var theta = latNumber * Math.PI / latitudeBands;
    var sinTheta = Math.sin(theta);
    var cosTheta = Math.cos(theta);

    for (longNumber = 0; longNumber <= longitudeBands; longNumber++) {
      var phi = longNumber * 2 * Math.PI / longitudeBands;
      var sinPhi = Math.sin(phi);
      var cosPhi = Math.cos(phi);

      var vx = cosPhi * sinTheta;
      var vy = cosTheta;
      var vz = sinPhi * sinTheta;
      var s = 1 - (longNumber / longitudeBands);
      var t = latNumber / latitudeBands;

      // Position
      vertexData.push(x + vx * radius);
      vertexData.push(y + vy * radius);
      vertexData.push(z + vz * radius);
      // Normal
      //vertexData.push(x);
      //vertexData.push(y);
      //vertexData.push(z);
      // Texture coordinate
      vertexData.push(s);
      vertexData.push(t);
    }
  }

  for (latNumber = 0; latNumber < latitudeBands; latNumber++) {
    for (longNumber = 0; longNumber < longitudeBands; longNumber++) {
      var first = (latNumber * (longitudeBands + 1)) + longNumber;
      var second = first + longitudeBands + 1;
      
      // First triangle
      indexData.push(first);
      indexData.push(second);
      indexData.push(first + 1);
      // Second triangle
      indexData.push(second);
      indexData.push(second + 1);
      indexData.push(first + 1);
    }
  }
  
  this.vertexArray = new Float32Array(vertexData);
  this.indexArray = new Uint16Array(indexData);
  
  this.vertexBuffer = gl["createBuffer"]();
  this.indexBuffer = gl["createBuffer"]();
  
  gl["bindBuffer"](gl["ARRAY_BUFFER"], this.vertexBuffer);
  gl["bufferData"](gl["ARRAY_BUFFER"], this.vertexArray, gl["STATIC_DRAW"]);
  
  gl["bindBuffer"](gl["ELEMENT_ARRAY_BUFFER"], this.indexBuffer);
  gl["bufferData"](gl["ELEMENT_ARRAY_BUFFER"], this.indexArray, gl["STATIC_DRAW"]);
}

Sphere.prototype = {
  render: function () {
    if (boundShader) {
      gl["bindBuffer"](gl["ARRAY_BUFFER"], this.vertexBuffer);
      
      vertexAttribPointer("a_position", 3, gl["FLOAT"], false, 20, 0);
      vertexAttribPointer("a_uv", 2, gl["FLOAT"], false, 20, 12);
      
      gl["bindBuffer"](gl["ELEMENT_ARRAY_BUFFER"], this.indexBuffer);
      
      gl["drawElements"](gl["TRIANGLES"], this.indexArray.length, gl["UNSIGNED_SHORT"], 0);
    }
  },
  
  renderLines: function () {
    gl["bindBuffer"](gl["ARRAY_BUFFER"], this.vertexBuffer);
      
    vertexAttribPointer("a_position", 3, gl["FLOAT"], false, 20, 0);
    
    gl["bindBuffer"](gl["ELEMENT_ARRAY_BUFFER"], this.indexBuffer);
    
    gl["drawElements"](gl["LINES"], this.indexArray.length, gl["UNSIGNED_SHORT"], 0);
  }
};

function Cube(x1, y1, z1, x2, y2, z2) {
  this.buffer = gl["createBuffer"]();
  this.data = new Float32Array([
    x1, y2, z1,
    x1, y2, z2,
    x1, y2, z2,
    x2, y2, z2,
    x2, y2, z2,
    x2, y2, z1,
    x2, y2, z1,
    x1, y2, z1,
    x1, y1, z1,
    x1, y1, z2,
    x1, y1, z2,
    x2, y1, z2,
    x2, y1, z2,
    x2, y1, z1,
    x2, y1, z1,
    x1, y1, z1,
    x1, y1, z2,
    x1, y2, z2,
    x1, y2, z1,
    x1, y1, z1,
    x2, y1, z2,
    x2, y2, z2,
    x2, y2, z1,
    x2, y1, z1
  ]);
  
  gl["bindBuffer"](gl["ARRAY_BUFFER"], this.buffer);
  gl["bufferData"](gl["ARRAY_BUFFER"], this.data, gl["STATIC_DRAW"]);
}

Cube.prototype = {
  renderLines: function () {
    if (boundShader) {
      gl["bindBuffer"](gl["ARRAY_BUFFER"], this.buffer);
      
      vertexAttribPointer("a_position", 3, gl["FLOAT"], false, 12, 0);
      
      gl["drawArrays"](gl["LINES"], 0, 24);
    }
  }
};

function Cylinder(x, y, z, r, h, bands) {
  var i, l;
  var step = Math.PI * 2 / bands;
  var offset = 0;

  var buffer = gl["createBuffer"]();
  var data = new Float32Array(72 * bands);

  // Top face
  for (i = 0, l = bands; i < l; i++) {
    var c = Math.cos(step * i) * r;
    var s = Math.sin(step * i) * r;
    var c2 = Math.cos(step * (i + 1)) * r;
    var s2 = Math.sin(step * (i + 1)) * r;
    var index = i * 72;

    // Top band
    data[index + 0] = 0;
    data[index + 1] = 0;
    data[index + 2] = h;
    data[index + 3] = c;
    data[index + 4] = s;
    data[index + 5] = h;

    data[index + 6] = 0;
    data[index + 7] = 0;
    data[index + 8] = h;
    data[index + 9] = c2;
    data[index + 10] = s2;
    data[index + 11] = h;

    data[index + 12] = c;
    data[index + 13] = s;
    data[index + 14] = h;
    data[index + 15] = c2;
    data[index + 16] = s2;
    data[index + 17] = h;

    // Bottom band
    data[index + 18] = 0;
    data[index + 19] = 0;
    data[index + 20] = -h;
    data[index + 21] = c;
    data[index + 22] = s;
    data[index + 23] = -h;

    data[index + 24] = 0;
    data[index + 25] = 0;
    data[index + 26] = -h;
    data[index + 27] = c2;
    data[index + 28] = s2;
    data[index + 29] = -h;

    data[index + 30] = c;
    data[index + 31] = s;
    data[index + 32] = -h;
    data[index + 33] = c2;
    data[index + 34] = s2;
    data[index + 35] = -h;

    // Side left-bottom band
    data[index + 36] = c;
    data[index + 37] = s;
    data[index + 38] = h;
    data[index + 39] = c;
    data[index + 40] = s;
    data[index + 41] = -h;

    data[index + 42] = c;
    data[index + 43] = s;
    data[index + 44] = h;
    data[index + 45] = c2;
    data[index + 46] = s2;
    data[index + 47] = -h;

    data[index + 48] = c;
    data[index + 49] = s;
    data[index + 50] = -h;
    data[index + 51] = c2;
    data[index + 52] = s2;
    data[index + 53] = -h;

    // Side right-top band
    data[index + 54] = c2;
    data[index + 55] = s2;
    data[index + 56] = -h;
    data[index + 57] = c;
    data[index + 58] = s;
    data[index + 59] = h;

    data[index + 60] = c2;
    data[index + 61] = s2;
    data[index + 62] = -h;
    data[index + 63] = c2;
    data[index + 64] = s2;
    data[index + 65] = h;

    data[index + 66] = c;
    data[index + 67] = s;
    data[index + 68] = h;
    data[index + 69] = c2;
    data[index + 70] = s2;
    data[index + 71] = h;
  }

  gl["bindBuffer"](gl["ARRAY_BUFFER"], buffer);
  gl["bufferData"](gl["ARRAY_BUFFER"], data, gl["STATIC_DRAW"]);

  this.buffer = buffer;
  this.data = data;
  this.bands = bands;
}

Cylinder.prototype = {
  renderLines: function () {
    if (boundShader) {
      gl["bindBuffer"](gl["ARRAY_BUFFER"], this.buffer);

      vertexAttribPointer("a_position", 3, gl["FLOAT"], false, 12, 0);

      gl["drawArrays"](gl["LINES"], 0, this.bands * 24);
    }
  }
};

function newRectangle(x, y, z, hw, hh, stscale) {
  return new Rectangle(x, y, z, hw, hh, stscale);
}

function newSphere(x, y, z, latitudeBands, longitudeBands, radius) {
  return new Sphere(x, y, z, latitudeBands, longitudeBands, radius);
}

function newCube(x1, y1, z1, x2, y2, z2) {
  return new Cube(x1, y1, z1, x2, y2, z2);
}

function newCylinder(x, y, z, r, h, bands) {
  return new Cylinder(x, y, z, r, h, bands);
}