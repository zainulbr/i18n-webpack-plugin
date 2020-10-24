/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
import ConstDependency from 'webpack/lib/dependencies/ConstDependency';
import NullFactory from 'webpack/lib/NullFactory';
import MissingLocalizationError from './MissingLocalizationError';
import makeLocalizeFunction from './MakeLocalizeFunction';

/**
 *
 * @param {object|function} localization
 * @param {object|string} Options object or obselete functionName string
 * @constructor
 */
class I18nPlugin {
  constructor(localization, poptions, failOnMissing) {
    let options = poptions;
    // Backward-compatiblility
    if (typeof options === 'string') {
      options = {
        functionName: options,
      };
    }

    if (typeof failOnMissing !== 'undefined') {
      options.failOnMissing = failOnMissing;
    }

    this.options = options || {};
    const plocalization = (typeof localization === 'function' ? localization : makeLocalizeFunction(localization, !!this.options.nested));
    this.localization = localization ? plocalization : {};
    this.functionName = this.options.functionName || '__';
    this.failOnMissing = !!this.options.failOnMissing;
    this.hideMessage = this.options.hideMessage || false;
  }

  apply(compiler) {
    const PLUGIN_NAME = 'I18nPlugin';
    const { localization, failOnMissing, hideMessage } = this; // eslint-disable-line no-unused-vars
    const name = this.functionName;

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, { normalModuleFactory }) => {
      compilation.dependencyFactories.set(ConstDependency, new NullFactory());
      compilation.dependencyTemplates.set(ConstDependency, new ConstDependency.Template());
      const handler = (parser) => { // eslint-disable-line no-unused-vars
        // should use function here instead of arrow function due to save the Tapable's context
        parser.hooks.call
          .for(name)
          .tap(`call ${name}`, (expr) => {
            let param;
            let defaultValue;
            switch (expr.arguments.length) {
              case 2:
                param = expr.arguments[1].value;
                if (typeof param !== 'string') return;
                defaultValue = expr.arguments[0].value;
                if (typeof defaultValue !== 'string') return;
                break;
              case 1:
                param = expr.arguments[0].value;
                if (typeof param !== 'string') return;
                defaultValue = param;
                break;
              default:
                return;
            }
            let result = localization && typeof localization === 'function' ? localization(param) : defaultValue;
            if (typeof result === 'undefined') {
              let error = parser.state.module[__dirname];
              if (!error) {
                error = new MissingLocalizationError(parser.state.module, param, defaultValue);
                parser.state.module[__dirname] = error;

                if (failOnMissing) {
                  parser.state.module.errors.push(error);
                } else if (!hideMessage) {
                  parser.state.module.warnings.push(error);
                }
              } else if (!error.requests.includes(param)) {
                error.add(param, defaultValue);
              }
              result = defaultValue;
            }

            const dep = new ConstDependency(JSON.stringify(result), expr.range);
            dep.loc = expr.loc;
            parser.state.current.addDependency(dep);
            return true;
          });
      };
      normalModuleFactory.hooks.parser
        .for('javascript/auto')
        .tap(PLUGIN_NAME, handler);
      normalModuleFactory.hooks.parser
        .for('javascript/dynamic')
        .tap(PLUGIN_NAME, handler);
      normalModuleFactory.hooks.parser
        .for('javascript/esm')
        .tap(PLUGIN_NAME, handler);
    });
  }
}

export default I18nPlugin;
