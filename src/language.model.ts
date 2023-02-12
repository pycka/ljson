export type Script = Expression | Expression[];

export type Expression = Call | Get | Lambda | Set | Value;

/**
 * Describes syntax of a function call expression.
 * Parameters:
 *  - raw string or expression returning string or function (strings will be used internally to 'get' the function)
 *  - list of arguments
 */
export type Call = ['call', string | Expression, (RawValue | Expression)[]?];
/**
 * Describes syntax of a function 'get' expression.
 * Parameters:
 *  - raw string or script returning string that will be used to get value from the context object or variables.
 */
export type Get = ['get', string | Script]; // todo context object as optional 3rd parameter
/**
 * Describes syntax of the 'lambda' expression evaluating to a JavaScript function.
 * Parameters:
 *  - list of parameter names
 *  - script body of the function
 */
export type Lambda = ['lambda', string[], Script];
/**
 * Describes syntax of the 'set' expression which updates context properties, creates new variables or updates
 * nested properties of available variables.
 * Basically an assignment operator.
 * Parameters:
 *  - string path expression to be used against context object (when starting with 'this.') or variables.
 *  - expression returning value to be assigned to the receiver
 */
export type Set = ['set', string, RawValue | Script];
/**
 * Describes syntax of the 'value' expression which evaluates directly to the value of it's only parameter.
 * Skips any interpretation of the given value.
 * Currently, the only way to define arrays.
 */
export type Value = ['value', any];

export type RawValue = undefined | null | boolean | string | number | object;