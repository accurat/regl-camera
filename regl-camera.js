var mouseChange = require('mouse-change')
var mouseWheel = require('mouse-wheel')
var identity = require('gl-mat4/identity')
var perspective = require('gl-mat4/perspective')
var lookAt = require('gl-mat4/lookAt')

module.exports = createCamera

var isBrowser = typeof window !== 'undefined'

var defaultProps = {
  // initial cameraState
  center: [0, 0, 0],
  theta: 0,
  phi: 0,
  distance: 10,
  up: [0, 1, 0],
  fovy: Math.PI / 4.0,
  near: 0.01,
  far: 1000,
  flipY: false,
  // properties
  element: null,
  damping: 0.9,
  minDistance: 0.1,
  maxDistance: 1000,
  mouse: true
}

function createCamera (regl, propsOverride) {
  var props = Object.assign({}, defaultProps, propsOverride)

  var cameraState = {
    view: identity(new Float32Array(16)),
    projection: identity(new Float32Array(16)),
    center: new Float32Array(props.center),
    theta: props.theta,
    phi: props.phi,
    distance: Math.log(props.distance),
    eye: new Float32Array(3),
    up: new Float32Array(props.up),
    fovy: props.fovy,
    near: props.near,
    far: props.far,
    flipY: Boolean(props.flipY),
    dtheta: 0,
    dphi: 0,
    mouseEnabled: true,
  }

  var element = props.element
  var startFovy = props.fovy

  function resize () {
    var width = element.clientWidth
    var height = element.clientHeight
    if (height / width > 1) {
      cameraState.fovy =  startFovy * (height / width)
    }
  }
  resize()
  window.addEventListener('resize', resize)

  var right = new Float32Array([1, 0, 0])
  var front = new Float32Array([0, 0, 1])

  var minDistance = Math.log(props.minDistance)
  var maxDistance = Math.log(props.maxDistance)

  var ddistance = 0

  if (isBrowser && props.mouse) {
    var prevX = 0
    var prevY = 0
    var elementListen = element || window
    var width = element ? element.offsetWidth : window.innerWidth
    var height = element ? element.offsetHeight : window.innerHeight

    mouseChange(elementListen, function (buttons, x, y) {
      if (!cameraState.mouseEnabled) return
      if (buttons & 1) {
        var dx = (x - prevX) / width
        var dy = (y - prevY) / height
        var w = Math.max(cameraState.distance, 0.5)

        cameraState.dtheta += w * dx
        cameraState.dphi += w * dy
      }
      prevX = x
      prevY = y
    })

    mouseWheel(elementListen, function (dx, dy) {
      if (!cameraState.mouseEnabled) return
      ddistance += dy / height
    })
  }

  function damp (x) {
    var xd = x * props.damping
    if (Math.abs(xd) < 0.1) {
      return 0
    }
    return xd
  }

  function clamp (x, lo, hi) {
    return Math.min(Math.max(x, lo), hi)
  }

  function updateCamera (props) {
    Object.keys(props).forEach(function (prop) {
      cameraState[prop] = props[prop]
    })

    var center = cameraState.center
    var eye = cameraState.eye
    var up = cameraState.up
    var dtheta = cameraState.dtheta
    var dphi = cameraState.dphi

    cameraState.theta += dtheta
    cameraState.phi = clamp(
      cameraState.phi + dphi,
      -Math.PI / 2.0,
      Math.PI / 2.0)
    cameraState.distance = clamp(
      cameraState.distance + ddistance,
      minDistance,
      maxDistance)

    cameraState.dtheta = damp(dtheta)
    cameraState.dphi = damp(dphi)
    ddistance = damp(ddistance)

    var theta = cameraState.theta
    var phi = cameraState.phi
    var r = Math.exp(cameraState.distance)

    var vf = r * Math.sin(theta) * Math.cos(phi)
    var vr = r * Math.cos(theta) * Math.cos(phi)
    var vu = r * Math.sin(phi)

    for (var i = 0; i < 3; ++i) {
      eye[i] = center[i] + vf * front[i] + vr * right[i] + vu * up[i]
    }

    lookAt(cameraState.view, eye, center, up)
  }

  var injectContext = regl({
    context: Object.assign({}, cameraState, {
      projection: function (context) {
        perspective(cameraState.projection,
          cameraState.fovy,
          context.viewportWidth / context.viewportHeight,
          cameraState.near,
          cameraState.far)

        if (cameraState.flipY) { cameraState.projection[5] *= -1 }

        updateCameraState(cameraState, setupCamera)

        return cameraState.projection
      }
    }),
    uniforms: Object.keys(cameraState).reduce(function (uniforms, name) {
      uniforms[name] = regl.context(name)
      return uniforms
    }, {})
  })

  function updateCameraState(cameraState, setupCamera) {
    Object.keys(cameraState).forEach(function (name) {
      setupCamera[name] = cameraState[name]
    })
  }

  function setupCamera (props, block) {
    if (!block) {
      block = props
      props = {}
    }
    updateCamera(props)
    injectContext(block)
  }

  updateCameraState(cameraState, setupCamera)

  return setupCamera
}
