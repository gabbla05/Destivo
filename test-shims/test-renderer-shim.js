// Shim to provide createRoot for @testing-library/react-native
const reactTestRenderer = require('react-test-renderer');

function createRoot(options) {
  let mountedRenderer = null;
  const container = {
    toJSON: () => mountedRenderer ? mountedRenderer.toJSON() : null,
    queryAll: (predicate, opts) => {
      if (!mountedRenderer) return [];
      // react-test-renderer TestInstance.findAll accepts predicate and options
      return mountedRenderer.root.findAll(predicate, opts || {});
    },
    get children() {
      return mountedRenderer ? mountedRenderer.root.children : [];
    }
  };

  return {
    render: (element) => {
      // Debug logging to ensure shim is used
      // eslint-disable-next-line no-console
      console.log('test-renderer-shim: render called');
      // Use act via react-test-renderer API
      mountedRenderer = reactTestRenderer.create(element, options);
      // eslint-disable-next-line no-console
      console.log('test-renderer-shim: mountedRenderer created');
    },
    unmount: () => {
      if (mountedRenderer && mountedRenderer.unmount) mountedRenderer.unmount();
      mountedRenderer = null;
    },
    container,
  };
}

module.exports = Object.assign({}, reactTestRenderer, { createRoot });
