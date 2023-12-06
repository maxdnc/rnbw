import * as parse5 from "parse5";

import { RainbowAppName } from "@_constants/global";
import { RootNodeUid } from "@_constants/main";

import {
  TFileNodeData,
  TFileNodeTreeData,
  TFileParserResponse,
  TNodeUid,
} from "../../";
import {
  THtmlDomNode,
  THtmlNode,
  THtmlNodeAttribs,
  THtmlNodeTreeData,
  THtmlParserResponse,
} from "../../node/type/html";
import { StageNodeIdAttr } from "./constants";

const parseHtml = (content: string): THtmlParserResponse => {
  const htmlDom = parse5.parse(content, {
    scriptingEnabled: true,
    sourceCodeLocationInfo: true,
    onParseError: (err) => {},
  });

  const nodeTree: THtmlNodeTreeData = {};
  (() => {
    nodeTree[RootNodeUid] = {
      uid: RootNodeUid,
      parentUid: null,

      displayName: RootNodeUid,

      isEntity: true,
      children: [],

      data: {
        childNodes: htmlDom.childNodes,

        valid: true,

        nodeName: "",
        tagName: "",
        textContent: "",

        attribs: {},

        sourceCodeLocation: {
          startLine: 0,
          startCol: 0,
          startOffset: 0,
          endLine: 0,
          endCol: 0,
          endOffset: 0,
        },
      },
    };
    const seedNodes: THtmlNode[] = [nodeTree[RootNodeUid]];
    let _uid = 0;

    const getHtmlNodeAttribs = (
      uid: TNodeUid,
      attrs: { name: string; value: string }[],
    ): THtmlNodeAttribs => {
      const attribs: THtmlNodeAttribs = {
        [StageNodeIdAttr]: uid,
      };
      attrs.map((attr) => {
        attribs[attr.name] = attr.value;
      });
      return attribs;
    };
    const proceedWithNode = (
      uid: TNodeUid,
      parentUid: TNodeUid,
      node: THtmlDomNode,
      nodeTree: THtmlNodeTreeData,
    ) => {
      const {
        startLine = 0,
        startCol = 0,
        startOffset = 0,
        endLine = 0,
        endCol = 0,
        endOffset = 0,
        startTag,
        endTag,
      } = node.sourceCodeLocation || {};

      nodeTree[parentUid].children.push(uid);
      nodeTree[parentUid].isEntity = false;

      nodeTree[uid] = {
        uid,
        parentUid: parentUid,

        displayName: node.nodeName,

        isEntity: true,
        children: [],

        data: {
          childNodes: node.childNodes,

          valid: node.nodeName !== "#documentType" && node.nodeName !== "#text",

          nodeName: node.nodeName,
          tagName: node.tagName || "",
          textContent: node.value || "",

          attribs: getHtmlNodeAttribs(uid, node.attrs || []),

          sourceCodeLocation: {
            startLine,
            startCol,
            startOffset,
            endLine,
            endCol,
            endOffset,
            startTag,
            endTag,
          },
        },
      };

      if (!node.attrs) node.attrs = [];
      node.attrs.push({ name: StageNodeIdAttr, value: uid });
    };

    while (seedNodes.length) {
      const node = seedNodes.shift() as THtmlNode;
      if (!node.data.childNodes) continue;

      node.data.childNodes.map((child: THtmlDomNode) => {
        const uid = String(++_uid);

        if (child.nodeName === "title") {
          window.document.title =
            child?.childNodes?.[0]?.value ?? RainbowAppName;
        }

        proceedWithNode(uid, node.uid, child, nodeTree);
        seedNodes.push(nodeTree[uid]);
      });
    }
  })();

  const uids = Object.keys(nodeTree);
  uids.map((uid) => {
    const node = nodeTree[uid];
    delete node.data.childNodes;
  });

  const contentInApp = parse5.serialize(htmlDom);

  return {
    contentInApp,
    nodeTree,
    htmlDom,
  };
};

export const fileHandlers: {
  [ext: string]: (content: string) => TFileParserResponse;
} = {
  html: parseHtml,
};

export const triggerFileChangeAlert = () => {
  const message = `Your changes will be lost if you don't save them. Are you sure you want to continue without saving?`;
  if (!window.confirm(message)) {
    return;
  }
};

export const confirmFileChanges = (fileTree: TFileNodeTreeData) => {
  if (fileTree) {
    // confirm files' changes
    let hasChangedFile = false;
    for (let x in fileTree) {
      const _file = fileTree[x];
      const _fileData = _file.data as TFileNodeData;
      if (_file && _fileData.changed) {
        hasChangedFile = true;
      }
    }
    if (hasChangedFile) {
      triggerFileChangeAlert();
    }
  }
};
