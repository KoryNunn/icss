var Lang = require('lang-js'),
    Token = Lang.Token,
    global = require('./global'),
    createSpec = require('spec-js');

var createNestingParser = Lang.createNestingParser,
    Scope = Lang.Scope;

function Token(){
    this.init && this.init();
}
Token = createSpec(Token, Lang.Token);
Token.prototype.render = function(){
    return this.result;
};

function isIdentifier(substring){
    var valid = /^[$A-Z_][0-9A-Z_$]*/i,
        possibleIdentifier = substring.match(valid);

    if (possibleIdentifier && possibleIdentifier.index === 0) {
        return possibleIdentifier[0];
    }
}

function tokeniseIdentifier(substring){
    // searches for valid identifiers or operators
    //operators
    var operators = "!=<>/&|*%-^?+\\",
        index = 0;

    while (operators.indexOf(substring.charAt(index)||null) >= 0 && ++index) {}

    if (index > 0) {
        return substring.slice(0, index);
    }

    var identifier = isIdentifier(substring);

    if(identifier != null){
        return identifier;
    }
}

function createKeywordTokeniser(Constructor, keyword){
    return function(substring){
        substring = isIdentifier(substring);
        if (substring === keyword) {
            return new Constructor(substring, substring.length);
        }
    };
}

function createOpperatorTokeniser(Constructor, opperator) {
    return function(substring){
        if(substring.indexOf(opperator) === 0){
            return new Constructor(opperator, opperator.length);
        }
    };
}

function createOpperatorEvaluator(fn) {
    return function(scope){
        this.leftToken.evaluate(scope);
        this.rightToken.evaluate(scope);
        this.result = fn(this.leftToken.result, this.rightToken.result);
    };
}

function evaluateTokens(tokens, scope){
    for(var i = 0; i < tokens.length; i++){
        tokens[i].evaluate && tokens[i].evaluate(scope);
    }
}

function compileTokens(tokens, isSource){
    return tokens.reduce(function(result, token){
        return result += token.render(isSource);
    }, '');
}

function StringToken(){}
StringToken = createSpec(StringToken, Token);
StringToken.tokenPrecedence = 2;
StringToken.prototype.parsePrecedence = 2;
StringToken.prototype.name = 'StringToken';
StringToken.tokenise = function (substring) {
    var stringChars = '"\'';
        charIndex = stringChars.indexOf(substring.charAt(0)),
        stringType = stringChars.charAt(charIndex);

    if(stringType) {
        var index = 0,
        escapes = 0;

        while (substring.charAt(++index) !== stringType)
        {
           if(index >= substring.length){
                   throw "Unclosed " + this.name;
           }
           if (substring.charAt(index) === '\\' && substring.charAt(index+1) === stringType) {
                   substring = substring.slice(0, index) + substring.slice(index + 1);
                   escapes++;
           }
        }

        return new this(
            substring.slice(0, index+1),
            index + escapes + 1
        );
    }
};
StringToken.prototype.evaluate = function () {
    this.result = this.original;
};

function BlockCommentToken(){}
BlockCommentToken = createSpec(BlockCommentToken, Token);
BlockCommentToken.tokenPrecedence = 1;
BlockCommentToken.prototype.parsePrecedence = 1;
BlockCommentToken.prototype.name = 'BlockCommentToken';
BlockCommentToken.tokenise = function (substring) {
    var close = '*/';

    if(substring.slice(0,2) !== '/*'){
        return;
    }

    var index = 0;

    while (substring.slice(++index,index + 2) !== close)
    {
       if(index >= substring.length){
            throw "Unclosed " + this.name;
       }
    }

    return new this(
        substring.slice(0, index+2),
        index + 2
    );
};
BlockCommentToken.prototype.evaluate = function(){};
BlockCommentToken.prototype.render = function(){
    return this.original;
};

function ParenthesesCloseToken(){}
ParenthesesCloseToken = createSpec(ParenthesesCloseToken, Token);
ParenthesesCloseToken.tokenPrecedence = 1;
ParenthesesCloseToken.prototype.parsePrecedence = 10;
ParenthesesCloseToken.prototype.name = 'ParenthesesCloseToken'
ParenthesesCloseToken.tokenise = function(substring) {
    if(substring.charAt(0) === ')'){
        return new ParenthesesCloseToken(substring.charAt(0), 1);
    }
}

function ParenthesesOpenToken(){}
ParenthesesOpenToken = createSpec(ParenthesesOpenToken, Token);
ParenthesesOpenToken.tokenPrecedence = 1;
ParenthesesOpenToken.prototype.parsePrecedence = 2;
ParenthesesOpenToken.prototype.name = 'ParenthesesOpenToken'
ParenthesesOpenToken.tokenise = function(substring) {
    if(substring.charAt(0) === '('){
        return new ParenthesesOpenToken(substring.charAt(0), 1);
    }
}
var parenthesisParser = createNestingParser(ParenthesesCloseToken);
ParenthesesOpenToken.prototype.parse = function(tokens, position, parse){
    parenthesisParser.apply(this, arguments);

    var leftIndex = 0,
        previousToken;

    while(previousToken = tokens[position - ++leftIndex],
        leftIndex < position &&
        previousToken &&
        previousToken.parsePrecedence > this.parsePrecedence
    ){}
    this.leftTokens = tokens.splice(position - leftIndex, leftIndex);
    this.leftToken = this.leftTokens[0];
};
ParenthesesOpenToken.prototype.evaluate = function(scope){
    for(var i = 0; i < this.childTokens.length; i++){
        this.childTokens[i].evaluate(scope);
    }

    if(this.leftToken && !(this.leftToken instanceof DelimiterToken)){
        this.leftToken.evaluate(scope);

        if(typeof this.leftToken.result !== 'function'){
            throw this.leftToken.original + " (" + this.leftToken.result + ")" + " is not a function";
        }

        var args = this.childTokens.reduce(function(results, childToken){
            if(childToken instanceof DelimiterToken){
                return results;
            }

            childToken.evaluate && childToken.evaluate(scope);

            results.push(childToken.result);

            return results;
        }, []);

        if(this.leftToken.result.__isFunctionExpression__){
            this.result = scope.callWith(this.leftToken.result, args, this);
        }else{
            this.result = this.leftToken.result.apply(null, args);
        }
    }else{
        this.result = this.childTokens.slice(-1)[0].result;
    }
}
ParenthesesOpenToken.prototype.render = function(isSource){
    if(isSource){
        return compileTokens(this.childTokens, true);
    }
    if(this.leftToken){
        return this.result;
    }else{
        return compileTokens(this.childTokens);
    }
};

function BraceCloseToken(){}
BraceCloseToken = createSpec(BraceCloseToken, Token);
BraceCloseToken.tokenPrecedence = 1;
BraceCloseToken.prototype.parsePrecedence = 10;
BraceCloseToken.prototype.name = 'BraceCloseToken'
BraceCloseToken.tokenise = function(substring) {
    if(substring.charAt(0) === '}'){
        return new BraceCloseToken(substring.charAt(0), 1);
    }
}

function BraceOpenToken(){}
BraceOpenToken = createSpec(BraceOpenToken, Token);
BraceOpenToken.tokenPrecedence = 1;
BraceOpenToken.prototype.parsePrecedence = 2;
BraceOpenToken.prototype.name = 'BraceOpenToken'
BraceOpenToken.tokenise = function(substring) {
    if(substring.charAt(0) === '{'){
        return new BraceOpenToken(substring.charAt(0), 1);
    }
}
var braceParser = createNestingParser(BraceCloseToken);
BraceOpenToken.prototype.parse = function(tokens, position, parse){
    braceParser.apply(this, arguments);

    var index = 0,
        currentToken;

    while(
        currentToken = tokens[position - ++index],
        currentToken &&
        !(currentToken instanceof SemicolonToken) &&
        !(currentToken instanceof FunctionToken) &&
        !(currentToken instanceof ParenthesesOpenToken) &&
        !(currentToken instanceof BraceOpenToken)
    ){}

    this.selectorTokens = parse(tokens.splice(position - index + 1, index -1));
};
BraceOpenToken.prototype.evaluate = function(scope){
    for(var i = 0; i < this.selectorTokens.length; i++){
        if(!this.selectorTokens[i].evaluate){
            continue;
        }
        this.selectorTokens[i].evaluate(scope);
    }

    for(var i = 0; i < this.childTokens.length; i++){
        var childToken = this.childTokens[i];
        if(!this.childTokens[i].evaluate){
            continue;
        }
        childToken.evaluate(scope);
        if(childToken.returned){
            this.result = childToken.result;
            return;
        }
    }

    this.result = undefined;
};
BraceOpenToken.prototype.render = function(){
    if(this.isFunction){
        return '/*' + compileTokens(this.selectorTokens) + '{' + compileTokens(this.childTokens) + '}' + '*/';
    }
    return compileTokens(this.selectorTokens) + '{' + compileTokens(this.childTokens) + '}';
};

function NumberToken(){}
NumberToken = createSpec(NumberToken, Token);
NumberToken.tokenPrecedence = 1;
NumberToken.prototype.parsePrecedence = 2;
NumberToken.prototype.name = 'NumberToken';
NumberToken.tokenise = function(substring) {
    var specials = {
        "NaN": Number.NaN,
        "-NaN": Number.NaN,
        "Infinity": Infinity,
        "-Infinity": -Infinity
    };
    for (var key in specials) {
        if (substring.slice(0, key.length) === key) {
            return new NumberToken(key, key.length);
        }
    }

    var valids = "0123456789-.Eex",
        index = 0;

    while (valids.indexOf(substring.charAt(index)||null) >= 0 && ++index) {}

    if (index > 0) {
        var result = substring.slice(0, index);
        if(isNaN(parseFloat(result))){
            return;
        }
        return new NumberToken(result, index);
    }

    return;
};
NumberToken.prototype.evaluate = function(scope){
    this.result = parseFloat(this.original);
};


function SemicolonToken(){}
SemicolonToken = createSpec(SemicolonToken, Token);
SemicolonToken.tokenPrecedence = 1;
SemicolonToken.prototype.parsePrecedence = 7;
SemicolonToken.prototype.name = 'SemicolonToken';
SemicolonToken.tokenise = function(substring) {
    if(substring.charAt(0) === ';'){
        return new SemicolonToken(substring.charAt(0), 1);
    }
};
SemicolonToken.prototype.parse = function(tokens, position){
    var index = position,
        previousToken = tokens[--index];

    while(previousToken && !(previousToken instanceof SemicolonToken)){
        previousToken = tokens[--index];
    }

    this.childTokens = tokens.splice(index+1, position - index - 1);
};
SemicolonToken.prototype.evaluate = function(scope){
    for(var i = 0; i < this.childTokens.length; i++){
        this.childTokens[i].evaluate(scope);
    }

    if(this.childTokens[this.childTokens.length-1] instanceof ReturnToken){
        this.returned = true;
    }

    this.result = this.childTokens[this.childTokens.length - 1].result;
};
SemicolonToken.prototype.render = function(scope){
    var result = compileTokens(this.childTokens);
    if(!(this.childTokens[this.childTokens.length - 1] instanceof AssignemntToken)){
        result+= this.original;
    }
    return result
};

function UnitToken(){}
UnitToken = createSpec(UnitToken, Token);
UnitToken.tokenPrecedence = 1;
UnitToken.prototype.parsePrecedence = 1;
UnitToken.prototype.name = 'UnitToken';
UnitToken.units = ['px', '%','em','deg','rad'];
UnitToken.tokenise = function(substring) {
    var match = substring.match(/^([0-9]+(?:px|%|em|deg|rad))/);
    if(match){
        return new UnitToken(match[0], match[0].length);
    }
};
UnitToken.prototype.evaluate = function(scope){
    this.result = this.original;
};

function HexToken(){}
HexToken = createSpec(HexToken, Token);
HexToken.tokenPrecedence = 1;
HexToken.prototype.parsePrecedence = 1;
HexToken.prototype.name = 'HexToken';
HexToken.tokenise = function(substring) {
    var match = substring.match(/^(\#[A-Fa-f0-9]+)/);
    if(match){
        return new HexToken(match[0], match[0].length);
    }
};
HexToken.prototype.evaluate = function(scope){
    this.result = this.original;
};

function NullToken(){}
NullToken = createSpec(NullToken, Token);
NullToken.prototype.name = 'NullToken';
NullToken.tokenPrecedence = 1;
NullToken.prototype.parsePrecedence = 2;
NullToken.tokenise = createKeywordTokeniser(NullToken, "null");
NullToken.prototype.parse = function(tokens, position){
};
NullToken.prototype.evaluate = function(scope){
    this.result = null;
};

function TrueToken(){}
TrueToken = createSpec(TrueToken, Token);
TrueToken.prototype.name = 'TrueToken';
TrueToken.tokenPrecedence = 1;
TrueToken.prototype.parsePrecedence = 2;
TrueToken.tokenise = createKeywordTokeniser(TrueToken, "true");
TrueToken.prototype.parse = function(tokens, position){
};
TrueToken.prototype.evaluate = function(scope){
    this.result = true;
};

function FalseToken(){}
FalseToken = createSpec(FalseToken, Token);
FalseToken.prototype.name = 'FalseToken';
FalseToken.tokenPrecedence = 1;
FalseToken.prototype.parsePrecedence = 2;
FalseToken.tokenise = createKeywordTokeniser(FalseToken, "false");
FalseToken.prototype.parse = function(tokens, position){
};
FalseToken.prototype.evaluate = function(scope){
    this.result = false;
};

function VariableToken(){}
VariableToken = createSpec(VariableToken, Token);
VariableToken.tokenPrecedence = 1;
VariableToken.prototype.parsePrecedence = 2;
VariableToken.prototype.name = 'VariableToken';
VariableToken.tokenise = createKeywordTokeniser(VariableToken, "var");
VariableToken.prototype.parse = function(tokens, position){
    var index = position,
        nextToken = tokens[++index];

    while(nextToken instanceof DelimiterToken){
        nextToken = tokens[++index];
    }

    this.childTokens = tokens.splice(position, index - position);

    this.identifierToken = this.childTokens[this.childTokens.length - 1];
};
VariableToken.prototype.evaluate = function(scope){
    scope.set(this.identifierToken.original, undefined);
    this.result = undefined;
};
VariableToken.prototype.render = function(scope){
    return this.original + compileTokens(this.childTokens);
};


function DelimiterToken(){}
DelimiterToken = createSpec(DelimiterToken, Token);
DelimiterToken.tokenPrecedence = 1;
DelimiterToken.prototype.parsePrecedence = 1;
DelimiterToken.prototype.name = 'DelimiterToken';
DelimiterToken.tokenise = function(substring) {
    var i = 0;
    while(i < substring.length && substring.charAt(i).trim() === "") {
        i++;
    }

    if(i){
        return new DelimiterToken(substring.slice(0, i), i);
    }
};
DelimiterToken.prototype.evaluate = function(){};
DelimiterToken.prototype.render = function(){
    return this.original;
}

function OpperatorToken(){}
OpperatorToken = createSpec(OpperatorToken, Token);
OpperatorToken.tokenPrecedence = 2;
OpperatorToken.prototype.parsePrecedence = 3;
OpperatorToken.prototype.name = 'OpperatorToken';
OpperatorToken.prototype.parse = function(tokens, position){

    var leftIndex = 0,
        previousToken;
    while(previousToken = tokens[position - ++leftIndex],
        leftIndex < position &&
        previousToken &&
        previousToken instanceof DelimiterToken
    ){}
    this.leftTokens = tokens.splice(position - leftIndex, leftIndex);
    this.leftToken = this.leftTokens[0];

    // Just spliced a few things before, need to reset position
    position -= leftIndex;

    var rightIndex = 0,
        nextToken;
    while(nextToken = tokens[++rightIndex + position],
        nextToken &&
        nextToken instanceof DelimiterToken
    ){}
    this.rightTokens = tokens.splice(position + 1, rightIndex);
    this.rightToken = this.rightTokens[this.rightTokens.length-1];
};
OpperatorToken.prototype.render = function(isSource){
    if(isSource){
        return compileTokens(this.leftTokens) + this.original + compileTokens(this.rightTokens);
    }

    return this.result;
};

function AssignemntToken(){}
AssignemntToken = createSpec(AssignemntToken, OpperatorToken);
AssignemntToken.prototype.parsePrecedence = 6;
AssignemntToken.prototype.name = 'AssignemntToken';
AssignemntToken.tokenise = createOpperatorTokeniser(AssignemntToken, '=');
AssignemntToken.prototype.evaluate = function(scope){
    this.rightToken.evaluate(scope);
    if(!(this.leftToken instanceof IdentifierToken)){
        throw "ReferenceError: Invalid left-hand side in assignment";
    }
    scope.set(this.leftToken.original, this.rightToken.result, true);
};
AssignemntToken.prototype.render = function(){
    return '/* ' + compileTokens(this.leftTokens, true) + this.original + compileTokens(this.rightTokens, true) + ' */';
};

function MultiplyToken(){}
MultiplyToken = createSpec(MultiplyToken, OpperatorToken);
MultiplyToken.prototype.name = 'MultiplyToken';
MultiplyToken.tokenise = createOpperatorTokeniser(MultiplyToken, '*');
MultiplyToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a * b;
});

function DivideToken(){}
DivideToken = createSpec(DivideToken, OpperatorToken);
DivideToken.prototype.name = 'DivideToken';
DivideToken.tokenise = createOpperatorTokeniser(DivideToken, '/');
DivideToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a / b;
});

function AddToken(){}
AddToken = createSpec(AddToken, OpperatorToken);
AddToken.prototype.name = 'AddToken';
AddToken.tokenise = createOpperatorTokeniser(AddToken, '+');
AddToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a + b;
});

function SubtractToken(){}
SubtractToken = createSpec(SubtractToken, OpperatorToken);
SubtractToken.prototype.name = 'SubtractToken';
SubtractToken.tokenise = createOpperatorTokeniser(SubtractToken, '-');
SubtractToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a - b;
});

function ModulusToken(){}
ModulusToken = createSpec(ModulusToken, OpperatorToken);
ModulusToken.prototype.name = 'ModulusToken';
ModulusToken.tokenise = createOpperatorTokeniser(ModulusToken, '%');
ModulusToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a % b;
});

function LessThanOrEqualToken(){}
LessThanOrEqualToken = createSpec(LessThanOrEqualToken, OpperatorToken);
LessThanOrEqualToken.prototype.name = 'LessThanOrEqualToken';
LessThanOrEqualToken.tokenise = createOpperatorTokeniser(LessThanOrEqualToken, '<=');
LessThanOrEqualToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a <= b;
});

function LessThanToken(){}
LessThanToken = createSpec(LessThanToken, OpperatorToken);
LessThanToken.prototype.name = 'LessThanToken';
LessThanToken.tokenise = createOpperatorTokeniser(LessThanToken, '<');
LessThanToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a < b;
});

function GreaterThanOrEqualToken(){}
GreaterThanOrEqualToken = createSpec(GreaterThanOrEqualToken, OpperatorToken);
GreaterThanOrEqualToken.prototype.name = 'GreaterThanOrEqualToken';
GreaterThanOrEqualToken.tokenise = createOpperatorTokeniser(GreaterThanOrEqualToken, '>=');
GreaterThanOrEqualToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a >= b;
});

function GreaterThanToken(){}
GreaterThanToken = createSpec(GreaterThanToken, OpperatorToken);
GreaterThanToken.prototype.name = 'GreaterThanToken';
GreaterThanToken.tokenise = createOpperatorTokeniser(GreaterThanToken, '>');
GreaterThanToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a > b;
});

function AndToken(){}
AndToken = createSpec(AndToken, OpperatorToken);
AndToken.prototype.name = 'AndToken';
AndToken.tokenise = createOpperatorTokeniser(AndToken, '&&');
AndToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a && b;
});

function OrToken(){}
OrToken = createSpec(OrToken, OpperatorToken);
OrToken.prototype.name = 'OrToken';
OrToken.tokenise = createOpperatorTokeniser(OrToken, '||');
OrToken.prototype.evaluate = createOpperatorEvaluator(function(a,b){
    return a || b;
});

function IdentifierToken(){}
IdentifierToken = createSpec(IdentifierToken, Token);
IdentifierToken.tokenPrecedence = 3;
IdentifierToken.prototype.parsePrecedence = 2;
IdentifierToken.prototype.name = 'IdentifierToken';
IdentifierToken.tokenise = function(substring){
    var result = tokeniseIdentifier(substring);

    if(result != null){
        return new IdentifierToken(result, result.length);
    }
};
IdentifierToken.prototype.evaluate = function(scope){
    this.result = scope.get(this.original);
};
IdentifierToken.prototype.render = function(scope){
    return this.result || this.original;
};

function PeriodToken(){}
PeriodToken = createSpec(PeriodToken, OpperatorToken);
PeriodToken.prototype.name = 'PeriodToken';
PeriodToken.tokenPrecedence = 2;
PeriodToken.prototype.parsePrecedence = 5;
PeriodToken.tokenise = createOpperatorTokeniser(PeriodToken, '.');
PeriodToken.prototype.evaluate = function(scope){
    if(
        (typeof this.leftToken.result === 'object' || typeof this.leftToken.result === 'function') &&
        this.leftToken.result.hasOwnProperty(this.rightToken.original)
    ){
        this.result = this.leftToken.result[this.rightToken.original];
    }
};
PeriodToken.prototype.render = function(scope){
    return compileTokens(this.leftTokens) + this.original + compileTokens(this.rightTokens);
};

function TupleToken(){}
TupleToken = createSpec(TupleToken, OpperatorToken);
TupleToken.prototype.name = 'TupleToken';
TupleToken.tokenPrecedence = 2;
TupleToken.prototype.parsePrecedence = 5;
TupleToken.tokenise = createOpperatorTokeniser(TupleToken, ':');
TupleToken.prototype.parse = function(tokens, position){

    var leftIndex = 0,
        previousToken;
    while(previousToken = tokens[position - ++leftIndex],
        leftIndex < position &&
        previousToken &&
        previousToken instanceof DelimiterToken
    ){}
    this.leftTokens = tokens.splice(position - leftIndex, leftIndex);
    this.leftToken = this.leftTokens[0];

    // Just spliced a few things before, need to reset position
    position -= leftIndex;

    var rightIndex = 0,
        nextToken;
    while(nextToken = tokens[++rightIndex + position],
        nextToken &&
        !(nextToken instanceof SemicolonToken)
    ){}
    this.rightTokens = tokens.splice(position + 1, rightIndex - 1);
    this.rightToken = this.rightTokens[this.rightTokens.length-1];
};
TupleToken.prototype.evaluate = function(scope){
    evaluateTokens(this.leftTokens, scope);
    evaluateTokens(this.rightTokens, scope);

    this.result = {};
    this.result[this.leftToken.result] = this.rightToken.result;
};
TupleToken.prototype.render = function(scope){
    return compileTokens(this.leftTokens) + ':' + compileTokens(this.rightTokens);
};

function FunctionToken(){}
FunctionToken = createSpec(FunctionToken, Token);
FunctionToken.prototype.name = 'FunctionToken';
FunctionToken.tokenPrecedence = 2;
FunctionToken.prototype.parsePrecedence = 5;
FunctionToken.tokenise = createKeywordTokeniser(FunctionToken, 'function');
FunctionToken.prototype.parse = function(tokens, position){
    var index = 0,
        currentToken;
    while(currentToken = tokens[++index + position], currentToken && !(currentToken instanceof BraceOpenToken)){}

    this.childTokens = tokens.splice(position+1, index);

    for(var i = 0; i < this.childTokens.length; i++){
        var childToken = this.childTokens[i];
        if(childToken instanceof DelimiterToken){
            continue;
        }

        if(childToken instanceof ParenthesesOpenToken){
            if(this.parametersToken){
                throw "Unexpected identifier: " + childToken.original;
            }
            this.parametersToken = childToken;
            continue;
        }

        if(childToken instanceof BraceOpenToken){
            if(this.bodyToken){
                throw "Unexpected identifier: " + childToken.original;
            }
            this.bodyToken = childToken;
            continue;
        }
    }
};
FunctionToken.prototype.evaluate = function(scope){
    var functionToken = this;

    var parameterNames = [];

    for (var i = 0; i < this.parametersToken.childTokens.length; i++){
        var parameterToken = this.parametersToken.childTokens[i];
        if(parameterToken instanceof DelimiterToken){
            continue;
        }
        if(parameterToken instanceof IdentifierToken){
            parameterNames.push(parameterToken.original);
            continue;
        }
        throw "Unexpected identifier: " + parameterToken.original;
    }

    this.result = function(scope, args){
        scope = new Scope(scope);

        for(var i = 0; i < parameterNames.length; i++){
            var parameterToken = args.getRaw(i, true);
            scope.set(parameterNames[i].original, parameterToken);
        }

        functionToken.bodyToken.evaluate(scope);

        return functionToken.bodyToken.result;
    };
    this.result.__isFunctionExpression__ = true;

    if(this.parametersToken.leftToken){
        scope.set(this.parametersToken.leftToken.original, this.result);
    }
};
FunctionToken.prototype.render = function(){

    return '/* Function... */';

    //ToDo: fix when source rendering is implemented
    // return '/*' +
    //     'function' +
    //     (this.nameToken ? this.nameToken.render(true) : '') +
    //     this.parametersToken.render(true) +
    //     this.bodyToken.render(true) +
    //     '*/';
};

function ReturnToken(){}
ReturnToken = createSpec(ReturnToken, Token);
ReturnToken.prototype.name = 'ReturnToken';
ReturnToken.tokenPrecedence = 2;
ReturnToken.prototype.parsePrecedence = 6;
ReturnToken.tokenise = createKeywordTokeniser(ReturnToken, 'return');
ReturnToken.prototype.parse = function(tokens, position){
    var index = 0,
        currentToken;
    while(currentToken = tokens[++index + position], currentToken && !(currentToken instanceof SemicolonToken)){}

    this.childTokens = tokens.splice(position+1, index-1);
};
ReturnToken.prototype.evaluate = function(scope){
    var lastValue;

    for(var i = 0; i < this.childTokens.length; i++){
        var childToken = this.childTokens[i];
        childToken.evaluate && childToken.evaluate(scope);
        if(!(childToken instanceof DelimiterToken)){
            lastValue = childToken;
        }
    }

    this.result = lastValue.result;
};

var tokenConverters = [
        StringToken,
        BlockCommentToken,
        ParenthesesOpenToken,
        ParenthesesCloseToken,
        BraceOpenToken,
        BraceCloseToken,
        UnitToken,
        HexToken,
        NumberToken,
        SemicolonToken,
        NullToken,
        TrueToken,
        FalseToken,
        VariableToken,
        DelimiterToken,
        AssignemntToken,
        MultiplyToken,
        DivideToken,
        AddToken,
        //ModulusToken,
        LessThanOrEqualToken,
        LessThanToken,
        GreaterThanOrEqualToken,
        GreaterThanToken,
        AndToken,
        OrToken,
        FunctionToken,
        ReturnToken,
        IdentifierToken,
        PeriodToken,
        TupleToken
    ];

var LiveSheet = function(source, scope){
    var liveSheet = {},
        lang = new Lang();

    liveSheet.Token = Token;

    liveSheet.lang = lang;
    liveSheet.tokenConverters = tokenConverters;
    liveSheet.global = global;
    liveSheet._source = source;
    liveSheet._scope = scope;
    liveSheet.tokenise = function(expression){
        return liveSheet.lang.tokenise(expression, liveSheet.tokenConverters);
    }
    liveSheet.evaluate = function(expression, injectedScope){
        var scope = new Lang.Scope();

        scope.add(this.global).add(injectedScope);

        var tokens = lang.evaluate(expression, scope, tokenConverters, true);

        var result = '';

        if(injectedScope){
            result += '\n\/* ';
            result += 'Current scope: \n\n';
            result += JSON.stringify(injectedScope, null, '    ');
            result += '\n\n*\/\n\n';
        }

        result += compileTokens(tokens);

        return result;
    };
    liveSheet.update = function(){
        this.result = this.evaluate(this._source, this._scope);
        if(this.render){
            this.render(this.result);
        }
    };
    liveSheet.scope = function(injectedScope){
        this._scope = injectedScope;
        this.update();
    };
    liveSheet.source = function(newSource){
        if(arguments.length){
            this._source = newSource;
            return this;
        }
        return this._source;
    };

    liveSheet.update();

    return liveSheet;
};

module.exports = LiveSheet;