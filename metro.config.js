const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const threePath = path.join(__dirname, 'node_modules/three');

/**
 * three: every import (bare `three`, addons) must share the WebGPU build,
 * otherwise addons pull in a second copy of the core.
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'glb', 'hdr', 'bin'],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'three' || moduleName === 'three/webgpu') {
        return { filePath: path.join(threePath, 'build/three.webgpu.js'), type: 'sourceFile' };
      }
      if (moduleName === 'three/tsl') {
        return { filePath: path.join(threePath, 'build/three.tsl.js'), type: 'sourceFile' };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
