import { get, set, toPath } from 'lodash';
import { Expression, RawValue, Script } from './language.model';

export type Variables = Record<string, any>;
export type ExtractExpressionName<T> = T extends [infer C, ...unknown[]] ? C : T;
export type CommandNames = ExtractExpressionName<Expression>;
export interface ExecutionContext {
  this: unknown;
  variables: Variables;
  lastValue?: unknown;
}

const rawValues = new WeakSet();
const implementations: Record<CommandNames, (context: ExecutionContext, ...params: any[]) => unknown> = {
  /**
   * Invoke function or method.
   * If the expression looks like a method invocation then parent expression will be used to get the context object.
   * If not, then interpreter's current context will be used instead.
   *
   * @todo add 3rd parameter: context
   */
  call: (context: ExecutionContext, functionExpression: string | Expression, params: (RawValue | Expression)[] = []): unknown => {
    const callPathOrFunction = typeof functionExpression !== 'string'
      ? execute(functionExpression, context) as (string | ((...args: unknown[]) => unknown))
      : functionExpression;
    let callContext = context.this;
    let functionToCall: ((...args: unknown[]) => unknown);
    if (typeof callPathOrFunction === 'function') {
      functionToCall = callPathOrFunction;
    } else {
      functionToCall = getValue(callPathOrFunction, context) as (...args: unknown[]) => unknown;
      const pathChunks = toPath(callPathOrFunction);
      if (pathChunks.length > 1) {
        callContext = getValue(pathChunks.slice(0, -1).join('.'), context);
      }
    }
    const callParams = params.map((param) =>
      isRawValue(param)
        ? param
        : execute(param, context)
    );
    if (typeof functionToCall !== 'function') {
      throw new Error(`expected "${callPathOrFunction}" expression to evaluate to a function`);
    }
    return functionToCall.apply(callContext, callParams);
  },

  /**
   * Get value from the context object or available variables.
   */
  get: (context: ExecutionContext, expression: string | Script): unknown => {
    const expressionToRead = typeof expression === 'string'
      ? expression
      : execute(expression, context);
    if (typeof expressionToRead !== 'string') {
      throw new Error(`expected string in GET ${expression}`);
    }
    return getValue(expressionToRead, context);
  },

  /**
   * Create function object. Useful when API expects a callback.
   */
  lambda: (context: ExecutionContext, paramNames: string[], script: Script): unknown => {
    return function (...args: unknown[]): unknown {
      const scopedVariables = Object.create(context.variables);
      paramNames.forEach((paramName, index) => {
        scopedVariables[paramName] = args[index];
      });
      const newContext: ExecutionContext = {
        ...context,
        variables: scopedVariables,
      };
      return execute(script, newContext);
    };
  },

  /**
   * Update value of a variable or context object property.
   * @todo mutate prototype chain object that contain actual values instead of the topmost one (simulating closures)
   */
  set: (context: ExecutionContext, receiver: string, valueExpression: Script): unknown => {
    const valueToSet = isRawValue(valueExpression)
      ? valueExpression
      : execute(valueExpression, context);
    if (receiver.startsWith('this.')) {
      set(context.this as object, receiver.substring(5), valueToSet);
    } else {
      set(context.variables, receiver, valueToSet);
    }
    return valueToSet;
  },

  /**
   * Returns passed value without any processing. Escapes any interpretation of the expression passed.
   */
  value: (context: ExecutionContext, expression: unknown): unknown => {
    if (expression && typeof expression === 'object') {
      rawValues.add(expression);
    }
    return expression;
  },
};

function isRawValue(value: unknown): value is RawValue {
  return !Array.isArray(value) || rawValues.has(value);
}

function isSingleExpression(script: Script): script is Expression {
  return script[0] && !Array.isArray(script[0]);
}

/**
 * @todo get rid of lodash
 */
function getValue(expression: string, context: ExecutionContext): unknown {
  if (expression === 'this' || expression.startsWith('this.') || expression.startsWith('this[')) {
    return get(context, expression)
  } else if (expression === '$') {
    return context.lastValue;
  } if (expression.startsWith('$.') || expression.startsWith('$[')) {
    return get(context.lastValue, expression.substring(2));
  } else {
    return get(context.variables, expression);
  }
}

export function execute(script: Script, executionContext: Partial<ExecutionContext> = {}): unknown {
  const contextWithDefaults: ExecutionContext = {
    this: executionContext.this ?? {},
    variables: executionContext.variables ?? {},
  };
  const expressionList: Expression[] = isSingleExpression(script)
    ? [script]
    : script;
  contextWithDefaults.lastValue = expressionList.reduce(
    (lastValue: unknown, [command, ...params]): unknown => {
      contextWithDefaults.lastValue = lastValue;
      return implementations[command](contextWithDefaults, ...params);
    },
    undefined
  );
  return contextWithDefaults.lastValue;
}