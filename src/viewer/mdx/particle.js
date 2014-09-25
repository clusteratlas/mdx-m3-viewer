function Particle() {
  this.position = vec3.create();
  this.velocity = vec3.create();
  this.orientation = 0;
  this.gravity = 0;
}

Particle.prototype = {
  reset: function (emitter, sequence, frame, counter) {
    var scale = emitter.node.scale[0];
    var speed = getSDValue(sequence, frame, counter, emitter.sd.speed, emitter.initialVelocity) * scale;
    var latitude = getSDValue(sequence, frame, counter, emitter.sd.latitude, emitter.latitude);
    var longitude = getSDValue(sequence, frame, counter, emitter.sd.longitude, emitter.longitude);
    var lifespan = getSDValue(sequence, frame, counter, emitter.sd.lifespan, emitter.lifespan);
    var gravity = getSDValue(sequence, frame, counter, emitter.sd.gravity, emitter.gravity) * scale;
    var position = this.position;
    var worldMatrix = emitter.node.worldMatrix;
    
    this.alive = true;
    this.health = lifespan;
    
    vec3.transformMat4(position, emitter.node.pivot, emitter.node.worldMatrix);
    
    var velocity = [];
    var rotation = mat4.create();
    var velocityStart = [];
    var velocityEnd = [];
    
    mat4.identity(rotation);
    mat4.rotateZ(rotation, rotation, math.random(-Math.PI, Math.PI));
    mat4.rotateY(rotation, rotation, math.random(-latitude, latitude));
    
    vec3.transformMat4(velocity, zAxis, rotation);
    vec3.normalize(velocity, velocity);
    
    vec3.add(velocityEnd, position, velocity);
    
    vec3.transformMat4(velocityStart, position, worldMatrix);
    vec3.transformMat4(velocityEnd, velocityEnd, worldMatrix);
    
    vec3.subtract(velocity, velocityEnd, velocityStart);
    vec3.normalize(velocity, velocity);
    vec3.scale(velocity, velocity, speed);
    
    vec3.copy(this.velocity, velocity);
    
    this.orientation = math.random(0, Math.PI * 2);
    this.gravity = gravity;
  },
  
  update: function (emitter, sequence, frame, counter) {
    if (this.alive) {
      this.health -= FRAME_TIME;
      
      this.velocity[2] -= this.gravity * FRAME_TIME;

      vec3.scaleAndAdd(this.position, this.position, this.velocity, FRAME_TIME);
    }
  }
};