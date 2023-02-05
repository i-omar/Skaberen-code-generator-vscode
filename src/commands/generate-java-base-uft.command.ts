import { existsSync, lstatSync } from 'fs';
import * as lodash from 'lodash';
import { InputBoxOptions, QuickPickItem, Uri, window, workspace } from 'vscode';

import Checkbox from '../models/checkbox';
import { methods } from '../models/method-actions';
import ParamMethodJava from '../models/param-method-java';
import {
  createController,
  createControllerExceptionHandler,
  createEntity,
  createEntityNotFoundException,
  createErrorProcessingException,
  createIService,
  createModelErrorMessage,
  createRepository,
  createService,
  createUnsavedEntityException,
  createUtilResultadoProcIfNotExist,
  createUtilSearchPaginationIfNotExist,
  createUtilUtilIfNotExist,
} from '../utils/generate-code-java-uft.utils';
import { createDirectory, promptForTargetDirectory } from '../utils/utils';

export const generateCodeJavaBase = async (uri: Uri) => {

  let targetDirectory;
  if (lodash.isNil(lodash.get(uri, "fsPath")) || !lstatSync(uri.fsPath).isDirectory()) {
    targetDirectory = await promptForTargetDirectory();
    if (lodash.isNil(targetDirectory)) {
      window.showErrorMessage("Please select a valid directory");
      return;
    }
  } else {
    targetDirectory = uri.fsPath;
  }


  // Add this line in the settings.json to enable the option to show whether or not to use ResultoftheProc class
  // "skaberen.ResultoftheProc": false,
  const isActiveOptionResultadoProd: boolean | undefined = await workspace.getConfiguration("skaberen").ResultoftheProc;
  isActiveOptionResultadoProd === undefined ? false : isActiveOptionResultadoProd;

  let useResulProc: boolean = false;

  if (isActiveOptionResultadoProd) {
    let codeStyle = await window.showQuickPick(['DO NOT use class ResultoftheProc', 'Use class ResultoftheProc'], {
      placeHolder: '',
    });
    useResulProc = codeStyle === 'Use class ResultoftheProc';
  }



  let entityName = await promptForEntityName();
  if (lodash.isNil(entityName) || entityName.trim() === "") {
    window.showErrorMessage("The class name must not be empty!");
    
    return;
  }
  entityName = entityName[0].toUpperCase() + entityName.slice(1);

  let typeVariableID = await window.showQuickPick(['int', 'long', 'String', 'other'], {
    placeHolder: 'Identifier Variable Type',
  });

  if (typeVariableID === 'other' || typeVariableID === undefined) {
    typeVariableID = await promptForTypeVariable();
    if (lodash.isNil(typeVariableID) || typeVariableID.trim() === "") {
      window.showErrorMessage("Variable type is invalid");
      return;
    }
  }


  const metodosChecboxes: Array<Checkbox> = methods;

  await showQuickPickMethods(metodosChecboxes, entityName).then(methods => {
    metodosChecboxes.forEach(checkBox => {
      checkBox.checked = false;
    });
    methods?.forEach(methodQuickPick => {
      metodosChecboxes.forEach(methodCheckbox => {
        if (methodCheckbox.methodName.trim() === methodQuickPick.label.trim()) {
          methodCheckbox.checked = true;
        }
      });
    });
  }
  );

  let useUtilClass = true;
  if (useResulProc) {
    const useUtilClassOpt = await window.showQuickPick([`Use local classes`, `Use UFT repository`], {
      placeHolder: 'Import utility classes (ResultProc, SearchPagination, etc)',
    });
    useUtilClass = useUtilClassOpt === `Use local classes`;
  }


  try {
    await generateAllCode(entityName, targetDirectory, typeVariableID, metodosChecboxes, useUtilClass, useResulProc);
    window.showInformationMessage(
      `Success! Code ${entityName} generated successfully`
    );
  } catch (error) {
    window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    );
  }
};

function promptForEntityName(): Thenable<string | undefined> {
  const entityNamePromptOptions: InputBoxOptions = {
    prompt: "Entity Name",
    placeHolder: "Ex: User",
  };
  return window.showInputBox(entityNamePromptOptions);
}

function promptForTypeVariable(): Thenable<string | undefined> {
  const entityNamePromptOptions: InputBoxOptions = {
    prompt: "Identifier Variable Type",
    placeHolder: "Ex: long",
  };
  return window.showInputBox(entityNamePromptOptions);
}

async function generateAllCode(
  entityName: string,
  targetDirectory: string,
  typeVariableID: string,
  methodsSelected: Array<Checkbox>,
  useUtilClass: boolean,
  useResulProc: boolean) {
  if (!existsSync(`${targetDirectory}/entities`)) {
    await createDirectory(`${targetDirectory}/entities`);
  }
  if (!existsSync(`${targetDirectory}/controllers`)) {
    await createDirectory(`${targetDirectory}/controllers`);
  }
  if (!existsSync(`${targetDirectory}/repositories`)) {
    await createDirectory(`${targetDirectory}/repositories`);
  }
  if (!existsSync(`${targetDirectory}/services`)) {
    await createDirectory(`${targetDirectory}/services`);
  }
  if (!existsSync(`${targetDirectory}/services/impl`)) {
    await createDirectory(`${targetDirectory}/services/impl`);
  }
  if (!existsSync(`${targetDirectory}/utils`) && useUtilClass) {
    await createDirectory(`${targetDirectory}/utils`);
  }
  if (!existsSync(`${targetDirectory}/models`) && !useResulProc) {
    await createDirectory(`${targetDirectory}/models`);
  }
  if (!existsSync(`${targetDirectory}/configurations`) && !useResulProc) {
    await createDirectory(`${targetDirectory}/configurations`);
  }
  if (!existsSync(`${targetDirectory}/exceptions`) && !useResulProc) {
    await createDirectory(`${targetDirectory}/exceptions`);
  }

  const data: ParamMethodJava = new ParamMethodJava({
    entityName: entityName,
    targetDirectory: targetDirectory,
    typeVariableID: typeVariableID,
    methodsSelected: methodsSelected,
    useUtilClass: useUtilClass,
    useResulProc: useResulProc,
  });
  await Promise.all([
    createEntity(data),
    createIService(data),
    createService(data),
    createController(data),
    createRepository(data),
  ]);
  if (!useResulProc) {
    await Promise.all([
      createUtilSearchPaginationIfNotExist(data),
      // createUtilUtilIfNotExist(data),
      createControllerExceptionHandler(data),
      createModelErrorMessage(data),
      createUnsavedEntityException(data),
      createErrorProcessingException(data),
      createEntityNotFoundException(data),
    ]);
  } else if (data.useUtilClass) {
    await Promise.all([
      createUtilResultadoProcIfNotExist(data),
      createUtilSearchPaginationIfNotExist(data),
      createUtilUtilIfNotExist(data),
    ]);
  }

}

const showQuickPickMethods = (checkboxes: Checkbox[], entityName: string) => {
  const pickItems: QuickPickItem[] = checkboxes.map(checkbox => {
    return {
      description: checkbox.description.replace('__ENTITY__', entityName),
      picked: checkbox.checked,
      label: checkbox.methodName.trim(),
    } as QuickPickItem;
  }
  );

  return window.showQuickPick(
    pickItems,
    {
      placeHolder: 'Select methods',
      ignoreFocusOut: false,
      matchOnDescription: true,
      canPickMany: true,
    }
  );
};



