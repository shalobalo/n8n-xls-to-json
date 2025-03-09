import { INodeType } from 'n8n-workflow';
import { XlsxToJson } from './nodes/XlsxToJson/XlsxToJson.node';

// Export the node in the format n8n expects
export const nodeTypes = [
  new XlsxToJson(),
];

// Named export to match the filename - critical for n8n to find the node
export const xlsxToJson = XlsxToJson;

// This is how n8n expects the node to be exported
export class XlsxToJsonNode {
  // Make the node class available like this
  static getNodeType(): INodeType {
    return new XlsxToJson();
  }

  // Make the node properties available like this
  static getNodeProperties(): object {
    return XlsxToJson.prototype.description;
  }
} 