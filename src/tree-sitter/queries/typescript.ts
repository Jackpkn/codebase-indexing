/*
 * Query for capturing:
 * - function declarations and expressions
 * - method declarations and definitions
 * - class declarations (including abstract classes)
 * - module/namespace declarations
 */
export default `
; Function declarations
(function_declaration
  name: (identifier) @name.definition.function) @definition.function

; Function expressions with identifiers
(variable_declarator
  name: (identifier) @name.definition.function
  value: (function)) @definition.function

; Arrow functions assigned to variables
(variable_declarator
  name: (identifier) @name.definition.function
  value: (arrow_function)) @definition.function

; Method definitions
(method_definition
  name: (property_identifier) @name.definition.method) @definition.method

; Class declarations
(class_declaration
  name: (type_identifier) @name.definition.class) @definition.class

; Class expressions assigned to variables
(variable_declarator
  name: (identifier) @name.definition.class
  value: (class_expression)) @definition.class

; TypeScript interfaces
(interface_declaration
  name: (type_identifier) @name.definition.interface) @definition.interface

; TypeScript method signatures in interfaces and types
(method_signature
  name: (property_identifier) @name.definition.method) @definition.method

; TypeScript abstract classes
(abstract_class_declaration
  name: (type_identifier) @name.definition.class) @definition.class

; TypeScript abstract methods
(abstract_method_definition
  name: (property_identifier) @name.definition.method) @definition.method

; TypeScript namespaces (modules)
(namespace_declaration
  name: (identifier) @name.definition.namespace) @definition.namespace

; TypeScript modules
(module_declaration
  name: (string
    (string_fragment) @name.definition.module)) @definition.module
`;
