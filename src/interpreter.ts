import { get, set, toPath } from 'lodash';
import { Expression, RawValue, Script } from './language.model';

export type Variables = Record<string, any>;
export type ExtractExpressionName<T> = T extends [infer C, ...unknown[]] ? C : T;
export type CommandNames = ExtractExpressionName<Expression>;

const rawValues = new WeakSet();
const implementations: Record<CommandNames, (context: unknown, variables: Variables, ...params: any[]) => unknown> = {
  /**
   * Invoke function or method.
   * If the expression looks like a method invocation then parent expression will be used to get the context object.
   * If not, then interpreter's current context will be used instead.
   *
   * @todo add 3rd parameter: context
   */
  call: (context: unknown, variables: Variables, functionExpression: string | Expression, params: (RawValue | Expression)[] = []): unknown => {
    const callPathOrFunction = typeof functionExpression !== 'string'
      ? execute(functionExpression, context, variables) as (string | ((...args: unknown[]) => unknown))
      : functionExpression;
    let callContext = context;
    let functionToCall: ((...args: unknown[]) => unknown);
    if (typeof callPathOrFunction === 'function') {
      functionToCall = callPathOrFunction;
    } else {
      functionToCall = getValue(callPathOrFunction, context, variables) as (...args: unknown[]) => unknown;
      const pathChunks = toPath(callPathOrFunction);
      if (pathChunks.length > 1) {
        callContext = getValue(pathChunks.slice(0, -1).join('.'), context, variables);
      }
    }
    const callParams = params.map((param) =>
      isRawValue(param)
        ? param
        : execute(param, context, variables)
    );
    return functionToCall.apply(callContext, callParams);
  },

  /**
   * Get value from the context object or available variables.
   */
  get: (context: unknown, variables: Variables, expression: string | Script): unknown => {
    const expressionToRead = typeof expression === 'string'
      ? expression
      : execute(expression, context, variables);
    if (typeof expressionToRead !== 'string') {
      throw `Execution error: expected string in GET ${expression}`;
    }
    return getValue(expressionToRead, context, variables);
  },

  /**
   * Create function object. Useful when API expects a callback.
   */
  lambda: (context: unknown, variables: Variables, paramNames: string[], script: Script): unknown => {
    return function (...args: unknown[]): unknown {
      const scopedVariables = Object.create(variables);
      paramNames.forEach((paramName, index) => {
        scopedVariables[paramName] = args[index];
      });
      return execute(script, context, scopedVariables);
    };
  },

  /**
   * Update value of a variable or context object property.
   * @todo mutate prototype chain object that contain actual values instead of the topmost one (simulating closures)
   */
  set: (context: any, variables: Variables, receiver: string, valueExpression: Script): unknown => {
    const valueToSet = isRawValue(valueExpression)
      ? valueExpression
      : execute(valueExpression, context, variables);
    if (receiver.startsWith('this.')) {
      set(context, receiver.substring(5), valueToSet);
    } else {
      set(variables, receiver, valueToSet);
    }
    return valueToSet;
  },

  /**
   * Returns passed value without any processing. Escapes any interpolation.
   */
  value: (context: unknown, variables: Variables, expression: unknown): unknown => {
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

function getValue(expression: string, context: unknown, variables: Variables): unknown {
  if (expression === 'this') {
    return context;
  } else if (expression.startsWith('this.')) {
    return get(context, expression.substring(5));
  } else {
    return get(variables, expression);
  }
}

export function execute(script: Script, context?: unknown, variables: Variables = {}): unknown {
  const expressionList: Expression[] = isSingleExpression(script)
    ? [script]
    : script;
  return expressionList.reduce(
    (previousValue: unknown, [command, ...params]): unknown => implementations[command](context, variables, ...params),
    undefined
  );
}