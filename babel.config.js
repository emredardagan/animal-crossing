module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // three.js uses static class blocks; Hermes needs them transformed
    '@babel/plugin-transform-class-static-block',
    // must stay last
    'react-native-worklets/plugin',
  ],
};
