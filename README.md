# Pure silliness!

The goal of this little library is to enable embedding of some simple logic into 
JSON files and execution without relaying on eval. Easy diffing might be a plus!

Inspired by Lisp, but I've done a terrible job replicating it. 

## Syntax

See [language model](./src/language.model.ts) for syntax reference.

## Semantics

All execution is performed in the context of _context_ object ("this") and a map of variables.
Both objects may be queried using _get_ and _call_ commands or updated using _set_.<br>
These objects provide the easiest way for bridging external environment with scripts. 

Scripts return last evaluated expression. This applies also to functions.

## Examples

See [tests](./src/interpreter.spec.ts).

## Requirements

Mocha and ts-node globally installed.

## To do:
- a build step
- compatibility with esm and commonjs
- closures
- remove dependency on Lodash
- commands: add, sub, mult, div, mod (and probably many more)
- access to native & host objects
- method chaining (maybe through a variable holding last return value?)
- runtime checks & error handling
- extensibility