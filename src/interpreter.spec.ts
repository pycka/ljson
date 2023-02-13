import assert from 'assert';
import { execute, Variables } from './interpreter';
import { Script } from './language.model';

describe('execute()', () => {
  function runExecute(script: Script, context?: unknown, variables?: Variables): unknown {
    return execute(script, { this: context, variables });
  }
  
  it('GIVEN empty list of expressions SHOULD return undefined', () => {
    assert.strictEqual(runExecute([]), undefined);
  });

  it('GIVEN 2 commands SHOULD return value of the last one', () => {
    const script: Script = [
      ['get', 'a'],
      ['get', 'b'],
    ];
    assert.strictEqual(runExecute(script, null, { a: 1, b: 2 }), 2);
  });

  describe('GET expression', () => {
    describe('GIVEN single instruction is passed to `execute`', () => {
      it('WHEN passed "this" as an expression SHOULD return context object', () => {
        const context = {};
        assert.strictEqual(runExecute(['get', 'this'], context, {}), context);
      });

      it('WHEN passed "a" as an expression SHOULD return "a" variable value', () => {
        assert.strictEqual(runExecute(['get', 'a'], null, { a: 5 }), 5);
      });

      it('WHEN passed "this.a" as an expression SHOULD return value of the "a" property of the context object', () => {
        assert.strictEqual(runExecute(['get', 'this.a'], { a: 10 }, { a: 5 }), 10);
      });

      it('WHEN ["get", "this.a"] expression is passed SHOULD return value of the variable named by context "a" property', () => {
        assert.strictEqual(runExecute(['get', ['get', 'this.a']], { a: 'b' }, { b: 5 }), 5);
      });
    });
  });

  describe('SET expression', () => {
    let context: any;
    let variables: any;

    beforeEach(() => {
      context = {
        nestedContext: {}
      };
      variables = {
        oldVariable: 'value',
        nestedVariable: {}
      };
    });

    it('WHEN raw value is set on the context object SHOULD update context object and return value', () => {
      const newValue = 5;
      assert.strictEqual(runExecute(['set', 'this.newProperty', newValue], context), newValue);
      assert.strictEqual(context.newProperty, newValue);
    });

    it('WHEN raw value is set on the nested context object SHOULD update proper object and return new value', () => {
      const newValue = { ala: 'ma kota' };
      assert.strictEqual(runExecute(['set', 'this.nestedContext.newProperty', newValue], context), newValue);
      assert.strictEqual(context.nestedContext.newProperty, newValue);
    });

    it('WHEN raw value is set on the variables object SHOULD update variable and return new value', () => {
      const newValue = true;
      assert.strictEqual(runExecute(['set', 'newProperty', newValue], context, variables), newValue);
      assert.strictEqual(variables.newProperty, newValue);
    });

    it('WHEN raw value is set on the nested variable object SHOULD update property on the variable and return new value', () => {
      const newValue = null;
      assert.strictEqual(runExecute(['set', 'nestedVariable.newProperty', newValue], context, variables), newValue);
      assert.strictEqual(variables.nestedVariable.newProperty, newValue);
    });

    it('WHEN empty array is set on the variable object SHOULD update property with undefined (empty expression result)', () => {
      const newValue = undefined;
      assert.strictEqual(runExecute(['set', 'newProperty', []], context, variables), newValue);
      assert.strictEqual(variables.newProperty, newValue);
    });

    describe('GIVEN expression is used as value source', () => {
      it('WHEN ["value", []] is passed SHOULD update variable with an empty array', () => {
        const newValue: unknown[] = [];
        assert.strictEqual(runExecute(['set', 'this.newProperty', ['value', newValue]], context), newValue);
        assert.strictEqual(context.newProperty, newValue);
      });

      it('WHEN ["get", "oldVariable"] is passed SHOULD update variable with value from existing variable', () => {
        const script: Script = ['set', 'this.newProperty', ['get', 'oldVariable']];
        assert.strictEqual(runExecute(script, context, variables), 'value');
        assert.strictEqual(context.newProperty, 'value');
      });
    });
  });

  describe('VALUE expression', () => {
    it('WHEN passed instruction-like argument SHOULD return raw value', () => {
      const argument = ['get', 'a'];
      assert.strictEqual(runExecute(['value', argument], {}, {}), argument);
    });
  });

  describe('CALL expression', () => {
    let context: any;
    let variables: any;

    beforeEach(() => {
      context = {
        contextProperty: 1,
        contextMethod() {
          return this.contextProperty;
        },
        nestedContext: {
          nestedProperty: 2,
          nestedMethod() {
            return this.nestedProperty;
          }
        }
      };
      variables = {
        variableOne: 3,
        functionOne() {
          return this.variableOne;
        },
        nestedVariable: {
          nestedProperty: 4,
          nestedMethod() {
            return this.nestedProperty;
          }
        }
      };
    });

    it('SHOULD invoke method on the context object', () => {
      assert.equal(runExecute(['call', 'this.contextMethod'], context, variables), 1);
    });

    it('SHOULD invoke nested method on the context object', () => {
      assert.equal(runExecute(['call', 'this.nestedContext.nestedMethod'], context, variables), 2);
    });

    it('SHOULD invoke function without context object', () => {
      assert.equal(runExecute(['call', 'functionOne'], context, variables), undefined);
    });

    it('SHOULD invoke nested method on the variable object', () => {
      assert.equal(runExecute(['call', 'nestedVariable.nestedMethod'], context, variables), 4);
    });
  });

  describe('LAMBDA expression', () => {
    const customError = 'error!';
    let context: any;
    let variables: any;

    beforeEach(() => {
      context = {
        getResolvedPromise(resolvedValue: unknown = 5) {
          return Promise.resolve(resolvedValue);
        }
      };
      variables = {
        getRejectingPromise() {
          return Promise.reject(customError);
        }
      };
    });

    it('SHOULD return a function', () => {
      const script: Script = ['lambda', ['one'], []];
      assert.equal(typeof runExecute(script), 'function');
    })
    ;
    it('SHOULD return a function returning 5', () => {
      const script: Script = ['lambda', ['one'], [['value', 5]]];
      assert.equal((runExecute(script) as (() => number))(), 5);
    });

    it('SHOULD subscribe to a context method returning promise and return resolved value', (done) => {
      variables.onResolve = function (resolvedValue: number): void {
        assert.equal(resolvedValue, 5);
        done();
      };
      variables.onFailure = done;
      const script: Script = [
        ['set', 'promise', ['call', 'this.getResolvedPromise']],
        ['call', 'promise.then',
          [
            ['lambda', ['resolvedValue'], ['call', 'onResolve', [['get', 'resolvedValue']]]],
            ['lambda', ['error'], ['call', 'onFailure', [['get', 'error']]]],
          ]
        ]
      ];
      runExecute(script, context, variables);
      assert.doesNotReject(() => variables.promise);
    });

    it('SHOULD subscribe to a function returning rejected promise and pass the error', (done) => {
      variables.onResolve = function (): void {
        done('should not happen!');
      };
      variables.onFailure = (error: unknown) => {
        assert.equal(error, customError);
        done();
      };
      const script: Script = [
        ['set', 'resolve', ['lambda', ['resolvedValue'], ['call', 'onResolve', [['get', 'resolvedValue']]]]],
        ['set', 'fail', ['lambda', ['error'], ['call', 'onFailure', [['get', 'error']]]]],
        ['set', 'promise', ['call', 'getRejectingPromise']],
        ['call', 'promise.then', [['get', 'resolve'], ['get', 'fail']]],
      ];
      runExecute(script, context, variables);
    });

    it('SHOULD subscribe to a function returning resolved promise, assert validity and complete the test', (done) => {
      variables.done = done;
      variables.assert = assert;
      const script: Script = [
        ['set', 'onResolve',
          ['lambda', ['resolvedValue'], [
            ['call', 'assert.equal', [['get', 'resolvedValue[0]'], ['value', 'get']]],
            ['call', 'assert.equal', [['get', 'resolvedValue[1]'], ['value', 'this']]],
            ['call', 'done']
          ]]
        ],
        ['set', 'promise', ['call', 'this.getResolvedPromise', [['value', ['get', 'this']]]]],
        ['set', 'promise', ['call', 'promise.then', [['get', 'onResolve']]]],
        ['call', 'promise.catch', [['get', 'done']]],
      ];
      runExecute(script, context, variables);
    });

    it('SHOULD chain calls using $ variable', (done) => {
      variables.done = done;
      variables.assert = assert;
      const script: Script = [
        ['set', 'onResolve',
          ['lambda', ['resolvedValue'], [
            ['call', 'assert.equal', [['get', 'resolvedValue[0]'], ['value', 'get']]],
            ['call', 'assert.equal', [['get', 'resolvedValue[1]'], ['value', 'this']]],
            ['call', 'done']
          ]]
        ],
        ['call', 'this.getResolvedPromise', [['value', ['get', 'this']]]],
        ['call', '$.then', [['get', 'onResolve']]],
        ['call', '$.catch', [['get', 'done']]],
      ];
      runExecute(script, context, variables);
    });
  });

});