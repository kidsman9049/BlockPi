'use strict';

goog.provide('Blockly.Python.AlienbotPi');

goog.require('Blockly.Python');

Blockly.Python['AlienbotPi_action'] = function (block) {
  Blockly.Python.definitions_['import SSR'] = 'import home.pi.AlienbotPi.Serial_Servo_Running as SSR';
  var dropdown_action = block.getFieldValue('action');				
  var value_time = Blockly.Python.valueToCode(block, 'time', Blockly.Python.ORDER_NONE);
  var code = 'SSR.running_action_group('+dropdown_action+','+value_time+')';
  return code;
};

