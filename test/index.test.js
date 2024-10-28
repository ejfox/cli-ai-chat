const {
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
} = require("node:test");
const assert = require("node:assert");
const sinon = require("sinon");
const blessed = require("blessed");
const { Controller } = require("../src/core/Controller");
const { TestEnvironment } = require("./setup");
const { logger } = require("../src/utils/Logger");

describe("AI Chat CLI", () => {
  let testEnv;
  let testConfig;
  let controller;
  let sandbox;
  let mockScreen;

  before(async () => {
    // Set up test environment once before all tests
    testEnv = new TestEnvironment();
    testConfig = await testEnv.setup();
  });

  after(async () => {
    // Clean up test environment after all tests
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Create a sinon sandbox for test isolation
    sandbox = sinon.createSandbox();

    // Mock blessed screen
    mockScreen = {
      render: sandbox.stub(),
      destroy: sandbox.stub(),
      key: sandbox.stub(),
    };
    sandbox.stub(blessed, "screen").returns(mockScreen);

    // Stub logger
    sandbox.stub(logger, "info");
    sandbox.stub(logger, "error");
    sandbox.stub(logger, "debug");

    // Initialize controller with test config
    controller = new Controller(testConfig);
    await controller.initialize();
  });

  afterEach(async () => {
    await controller.shutdown();
    sandbox.restore();
  });

  // ... rest of test cases remain the same ...
});
