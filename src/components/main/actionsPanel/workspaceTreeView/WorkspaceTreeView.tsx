/* eslint-disable react/prop-types */
import React, { useCallback, useContext, useEffect, useMemo } from "react";

import { DraggingPositionItem } from "react-complex-tree";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import { RootNodeUid } from "@_constants/main";
import { TreeView } from "@_components/common";
import {
  getNormalizedPath,
  createURLPath,
  TFileNodeData,
  confirmFileChanges,
} from "@_node/file";
import { _path } from "@_node/file/nohostApis";
import { TNode, TNodeUid } from "@_node/types";
import { MainContext } from "@_redux/main";
import { setHoveredFileUid } from "@_redux/main/fileTree";
import { FileTree_Event_ClearActionType } from "@_redux/main/fileTree/event";
import { setActivePanel } from "@_redux/main/processor";
import { useAppState } from "@_redux/useAppState";
import { generateQuerySelector } from "@_services/main";

import {
  useCmdk,
  useDefaultFileCreate,
  useNodeActionsHandler,
  useNodeViewState,
  useSync,
} from "./hooks";
import { useSaveCommand } from "@_pages/main/processor/hooks";
import { debounce, getObjKeys } from "@_pages/main/helper";
import {
  Container,
  ItemArrow,
  ItemTitle,
  TreeItem,
} from "@_components/common/treeComponents";
import { NodeIcon } from "./workspaceComponents/NodeIcon";
import { TFilesReference } from "@rnbws/rfrncs.design";

const AutoExpandDelayOnDnD = 1 * 1000;
export default function WorkspaceTreeView() {
  const dispatch = useDispatch();
  const {
    initialFileUidToOpen,
    currentFileUid,
    fileTree,
    fFocusedItem: focusedItem,
    fExpandedItemsObj,
    fSelectedItemsObj,
    linkToOpen,
    autoSave,
    activePanel,
    renderableFileUid,
    filesReferenceData,
    currentProjectFileHandle,
    recentProject,
    invalidFileNodes,
    hoveredFileUid,
  } = useAppState();

  const { importProject } = useContext(MainContext);
  const navigate = useNavigate();
  const { project, "*": rest } = useParams();

  const { focusedItemRef, fileTreeViewData } = useSync();
  const { cb_focusNode, cb_selectNode, cb_expandNode, cb_collapseNode } =
    useNodeViewState({ invalidFileNodes });
  const {
    cb_startRenamingNode,
    cb_abortRenamingNode,
    cb_renameNode,
    cb_moveNode,
    cb_readNode,
  } = useNodeActionsHandler();
  const { onSaveCurrentFile } = useSaveCommand();

  useCmdk();
  useDefaultFileCreate();

  // open default initial html file
  useEffect(() => {
    if (initialFileUidToOpen !== "" && fileTree[initialFileUidToOpen]) {
      cb_focusNode(initialFileUidToOpen);
      cb_selectNode([initialFileUidToOpen]);
      cb_readNode(initialFileUidToOpen);
    }
  }, [initialFileUidToOpen]);

  // handlle links-open
  const openFile = useCallback(
    (uid: TNodeUid) => {
      if (currentFileUid === uid) return;
      dispatch({ type: FileTree_Event_ClearActionType });
      // focus/select/read the file
      cb_focusNode(uid);
      cb_selectNode([uid]);
      cb_readNode(uid);
      const newURL = createURLPath(
        uid,
        RootNodeUid,
        fileTree[RootNodeUid]?.displayName,
      );
      navigate(newURL);
    },
    [fileTree, cb_focusNode, cb_selectNode, cb_readNode, currentFileUid],
  );
  useEffect(() => {
    if (!linkToOpen || linkToOpen === "") return;

    const node = fileTree[currentFileUid];
    if (node === undefined) return;
    const parentNode = fileTree[node.parentUid!];
    if (parentNode === undefined) return;

    const { isAbsolutePath, normalizedPath } = getNormalizedPath(linkToOpen);
    if (isAbsolutePath) {
      window.open(normalizedPath, "_blank")?.focus();
    } else {
      const fileUidToOpen = _path.join(parentNode.uid, normalizedPath);
      openFile(fileUidToOpen);
    }
  }, [linkToOpen]);

  useEffect(
    function RevertWcOpen() {
      if (activePanel === "stage") {
        openFile(renderableFileUid);
      }
    },
    [activePanel],
  );

  const onPanelClick = useCallback(() => {
    activePanel !== "file" && dispatch(setActivePanel("file"));
  }, [activePanel]);

  const openFromURL = useCallback(async () => {
    if (!project) return;
    const pathName = `${RootNodeUid}/${rest}`;
    const isCurrentProject = currentProjectFileHandle?.name === project;
    const isDifferentFile = currentFileUid !== pathName;

    if (isCurrentProject && isDifferentFile) {
      openFile(pathName);
    } else if (!isCurrentProject) {
      const index = recentProject.findIndex(
        (_recentProject) => _recentProject.name === project,
      );

      if (index >= 0) {
        const projectContext = recentProject[index].context;
        const projectHandler = recentProject[index].handler;
        if (projectHandler && currentFileUid !== projectHandler.name) {
          confirmFileChanges(fileTree) &&
            importProject(projectContext, projectHandler, true);
        }
        openFile(pathName);
      }
    }
  }, [project, rest, recentProject]);

  useEffect(() => {
    openFromURL();
  }, [openFromURL]);

  return (
    <div
      id="FileTreeView"
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
      }}
      onClick={onPanelClick}
    >
      <TreeView
        width={"100%"}
        height={"auto"}
        info={{ id: "file-tree-view" }}
        data={fileTreeViewData}
        focusedItem={focusedItem}
        expandedItems={getObjKeys(fExpandedItemsObj)}
        selectedItems={getObjKeys(fSelectedItemsObj)}
        renderers={{
          renderTreeContainer: (props) => <Container {...props} />,
          renderItemsContainer: (props) => <Container {...props} />,

          renderItem: (props) => {
            // rename the newly created file
            useEffect(() => {
              const node = props.item.data as TNode;
              if (!node.data.valid) {
                props.context.selectItem();
                props.context.startRenamingItem();
              }
            }, []);

            const fileReferenceData = useMemo<TFilesReference>(() => {
              const node = props.item.data as TNode;
              const nodeData = node.data as TFileNodeData;
              const refData =
                filesReferenceData[
                  nodeData.kind === "directory"
                    ? "folder"
                    : nodeData.ext
                      ? nodeData.ext.slice(1)
                      : nodeData.ext
                ];
              return refData;
            }, []);

            const onClick = useCallback(
              async (e: React.MouseEvent) => {
                e.stopPropagation();
                try {
                  const promises = [];

                  if (fileTree[currentFileUid]?.data?.changed && autoSave) {
                    promises.push(onSaveCurrentFile());
                  }
                  // Skip click-event from an inline rename input
                  const targetId = e.target && (e.target as HTMLElement).id;
                  if (targetId === "FileTreeView-RenameInput") {
                    return;
                  }

                  if (!props.context.isFocused) {
                    props.context.focusItem();
                    focusedItemRef.current = props.item.index as TNodeUid;
                  }
                  if (e.shiftKey) {
                    promises.push(props.context.selectUpTo());
                  } else if (e.ctrlKey) {
                    promises.push(
                      props.context.isSelected
                        ? props.context.unselectItem()
                        : props.context.addToSelectedItems(),
                    );
                  } else {
                    promises.push(props.context.selectItem());
                    if (props.item.isFolder) {
                      promises.push(props.context.toggleExpandedState());
                    } else {
                      promises.push(props.context.primaryAction());
                    }
                  }

                  promises.push(dispatch(setActivePanel("file")));
                  // Wait for all promises to resolve
                  await Promise.all(promises);

                  openFile(props.item.index as TNodeUid);
                } catch (error) {
                  console.error(error);
                }
              },
              [props.item, props.context, fileTree, autoSave, currentFileUid],
            );

            const onDragStart = (e: React.DragEvent) => {
              const target = e.target as HTMLElement;
              e.dataTransfer.setDragImage(
                target,
                window.outerWidth,
                window.outerHeight,
              );
              props.context.startDragging();
            };
            const debouncedExpand = useCallback(
              debounce(cb_expandNode, AutoExpandDelayOnDnD),
              [cb_expandNode],
            );
            const onDragEnter = () => {
              if (!props.context.isExpanded) {
                debouncedExpand(props.item.index as TNodeUid);
              }
            };

            const onMouseEnter = useCallback(
              () =>
                hoveredFileUid !== props.item.index &&
                dispatch(setHoveredFileUid(props.item.index as TNodeUid)),
              [props.item.index, hoveredFileUid],
            );
            const onMouseLeave = useCallback(
              () => hoveredFileUid && dispatch(setHoveredFileUid("")),
              [hoveredFileUid],
            );

            return (
              <TreeItem
                {...props}
                key={`FileTreeView-${props.item.index}${props.item.data.data.nodeName}`}
                id={`FileTreeView-${generateQuerySelector(
                  props.item.index.toString(),
                )}`}
                invalidFileNodes={invalidFileNodes}
                eventHandlers={{
                  onClick: onClick,
                  onMouseEnter: onMouseEnter,
                  onMouseLeave: onMouseLeave,
                  onFocus: () => {},
                  onDragStart: onDragStart,
                  onDragEnter: onDragEnter,
                }}
                nodeIcon={
                  <>
                    <NodeIcon
                      item={props.item}
                      fileReferenceData={fileReferenceData}
                    />
                    {props.title}
                  </>
                }
              />
            );
          },
          renderItemArrow: ({ item, context }) => (
            <ItemArrow item={item} context={context} />
          ),
          renderItemTitle: ({ title, item }) => {
            const fileOrDirectoryTitle = title;
            const fileExt = item?.data?.data?.ext
              ? `.${item?.data?.data?.ext}`
              : "";
            const fileOrDirTitle = fileOrDirectoryTitle + fileExt;

            return (
              <ItemTitle
                title={fileOrDirTitle}
                isChanged={
                  fileTree[item.data.uid] &&
                  (fileTree[item.data.uid].data as TFileNodeData).changed
                }
              />
            );
          },
          renderRenameInput: (props) => {
            const onChange = useCallback(
              (e: React.ChangeEvent<HTMLInputElement>) => {
                props.inputProps.onChange && props.inputProps.onChange(e);
              },
              [props.inputProps],
            );

            const onBlur = useCallback(
              (e: React.FocusEvent<HTMLInputElement, Element>) => {
                props.inputProps.onBlur && props.inputProps.onBlur(e);
                props.formProps.onSubmit &&
                  props.formProps.onSubmit(
                    new Event(
                      "",
                    ) as unknown as React.FormEvent<HTMLFormElement>,
                  );
              },
              [props.inputProps, props.formProps],
            );

            return (
              <>
                <form
                  {...props.formProps}
                  className={"align-center justify-start"}
                >
                  <input
                    id={"FileTreeView-RenameInput"}
                    {...props.inputProps}
                    ref={props.inputRef}
                    className={`text-s`}
                    style={{
                      outline: "none",
                      margin: "0",
                      border: "none",
                      padding: "0",
                      background: "transparent",
                      height: "12px",
                    }}
                    onChange={onChange}
                    onBlur={onBlur}
                  />
                  <button ref={props.submitButtonRef} className={"hidden"} />
                </form>
              </>
            );
          },
        }}
        props={{
          canDragAndDrop: true,
          canDropOnFolder: true,
          canDropOnNonFolder: false,
          canReorderItems: false,
          canSearch: false,
          canSearchByStartingTyping: false,
          canRename: true,
        }}
        callbacks={{
          onStartRenamingItem: (item) => {
            cb_startRenamingNode(item.index as TNodeUid);
          },
          onAbortRenamingItem: (item) => {
            cb_abortRenamingNode(item);
          },
          onRenameItem: (item, name) => {
            cb_renameNode(item, name);
          },

          onSelectItems: (items) => {
            cb_selectNode(items as TNodeUid[]);
          },
          onFocusItem: (item) => {
            cb_focusNode(item.index as TNodeUid);
          },
          onExpandItem: (item) => {
            cb_expandNode(item.index as TNodeUid);
          },
          onCollapseItem: (item) => {
            cb_collapseNode(item.index as TNodeUid);
          },

          onPrimaryAction: (item) => {
            item.data.data.valid && cb_readNode(item.index as TNodeUid);
          },

          onDrop: (items, target) => {
            const targetUid = (target as DraggingPositionItem)
              .targetItem as TNodeUid;
            if (invalidFileNodes[targetUid]) return;
            const uids = items
              .map((item) => item.index as TNodeUid)
              .filter(
                (uid) =>
                  !invalidFileNodes[uid] &&
                  fileTree[uid].parentUid !== targetUid,
              );
            if (uids.length === 0) return;

            cb_moveNode(uids, targetUid);
          },
        }}
      />
    </div>
  );
}
