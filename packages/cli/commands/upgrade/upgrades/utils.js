const tsMorph = require("ts-morph");
const path = require("path");
const fs = require("fs");
const prettier = require("prettier");
const loadJson = require("load-json-file");
const writeJson = require("write-json-file");
const semverCoerce = require("semver/functions/coerce");
const execa = require("execa");
/**
 *
 * @param pkg {string}
 * @param version {string}
 *
 * @return {boolean}
 */
const validateVersion = (pkg, version) => {
    if (version === "latest") {
        return true;
    }
    const coerced = semverCoerce(version);
    if (coerced) {
        return true;
    }
    return false;
};
/**
 * @deprecated
 */
const insertImport = (source, name, pkg) => {
    throw new Error("Should not be used anymore.");
    const statements = source.getStatements();
    let importAlreadyExists = false;
    const lastImportStatement = statements.reduce((indexAt, statement, index) => {
        if (statement.getKind() !== tsMorph.SyntaxKind.ImportDeclaration) {
            return indexAt;
        }
        const compilerNode = statement.compilerNode || {};
        const moduleSpecifier = compilerNode.moduleSpecifier || {};
        const importedPackageName = moduleSpecifier.text;
        if (importedPackageName === pkg) {
            importAlreadyExists = true;
        }
        return index > indexAt ? index : indexAt;
    }, -1);
    if (importAlreadyExists) {
        throw new Error(`Package "${pkg}" is already imported.`);
    } else if (lastImportStatement === -1) {
        throw new Error(
            `Could not find last import statement so we can insert new import "${name}"`
        );
    }

    console.log(`Inserting import to position ${lastImportStatement + 1}`);
    source.insertStatements(lastImportStatement + 1, `import ${name} from "${pkg}";`);
};
/**
 *
 * @param context {ContextInterface}
 * @param targetPath {string}
 * @param packages {object}
 */
const addPackagesToDependencies = (context, targetPath, packages) => {
    addPackagesToDeps("dependencies", context, targetPath, packages);
};
/**
 * @param context {ContextInterface}
 * @param targetPath {string}
 * @param packages {object}
 */
const addPackagesToDevDependencies = (context, targetPath, packages) => {
    addPackagesToDeps("devDependencies", context, targetPath, packages);
};
/**
 * @param context {ContextInterface}
 * @param targetPath {string}
 * @param packages {object}
 */
const addPackagesToPeerDependencies = (context, targetPath, packages) => {
    addPackagesToDeps("peerDependencies", context, targetPath, packages);
};
/**
 *
 * @param type {string}
 * @param context {ContextInterface}
 * @param targetPath {string}
 * @param packages {object}
 */
const allowedPackageDependencyTypes = ["dependencies", "devDependencies", "peerDependencies"];
const addPackagesToDeps = (type, context, targetPath, packages) => {
    if (!allowedPackageDependencyTypes.includes(type)) {
        context.error(`Package dependency type "${type}" is not valid.`);
        return;
    }
    const file = `${targetPath}/package.json`;
    if (!fs.existsSync(file)) {
        context.error(`There is no package.json file at path "${file}".`);
        return;
    }
    const json = loadJson.sync(file);
    if (!json) {
        context.error(`There is no package.json file "${file}"`);
        return;
    }
    const dependencies = json[type] || {};
    for (const pkg in packages) {
        if (!packages.hasOwnProperty(pkg)) {
            continue;
        }
        const version = packages[pkg];

        if (version === null) {
            // Remove package from deps
            delete dependencies[pkg];
            continue;
        }
        if (!validateVersion(pkg, version)) {
            context.error(`Package "${pkg}" version is not a valid semver version: "${version}".`);
            continue;
        }
        dependencies[pkg] = version;
    }
    json[type] = dependencies;

    writeJson.sync(file, json);
};

const createMorphProject = files => {
    const project = new tsMorph.Project();
    for (const file of files) {
        project.addSourceFileAtPath(file);
    }
    return project;
};

const prettierFormat = async (files, context) => {
    try {
        context.info("Running prettier...");
        for (const file of files) {
            const filePath = path.join(process.cwd(), file);
            const options = await prettier.resolveConfig(filePath);
            const fileContentRaw = fs.readFileSync(filePath).toString("utf8");
            const fileContentFormatted = prettier.format(fileContentRaw, {
                ...options,
                filepath: filePath
            });
            fs.writeFileSync(filePath, fileContentFormatted);
        }

        context.info("Finished formatting files.");
    } catch (ex) {
        console.log(context.error.hl("Prettier failed."));
        context.error(ex.message);
        if (ex.stdout) {
            console.log(ex.stdout);
        }
    }
};

/**
 * Run to install new packages in the project.
 */
const yarnInstall = async ({ context }) => {
    const { info, error } = context;
    try {
        info("Installing new packages...");
        await execa("yarn", { cwd: process.cwd() });
        info("Finished installing new packages.");
    } catch (ex) {
        error("Installation of new packages failed.");
        console.log(error(ex.message));
        if (ex.stdout) {
            console.log(ex.stdout);
        }
    }
};

/**
 * Run to up the versions of all packages.
 */
const yarnUp = async ({ context, targetVersion }) => {
    const { info, error } = context;
    try {
        info(`Updating all package versions to ${targetVersion}...`);
        await execa(`yarn`, [`up`, `@webiny/*@${targetVersion}`], { cwd: process.cwd() });
        await execa("yarn", { cwd: process.cwd() });
        info("Finished update packages.");
    } catch (ex) {
        error("Updating of the packages failed.");
        console.log(ex);
        console.log(error(ex.message));
        if (ex.stdout) {
            console.log(ex.stdout);
        }
    }
};

/**
 *
 * @param plugins {tsMorph.Node}
 * @param afterElement {String|undefined}
 * @returns {null|number}
 */
const findElementIndex = (plugins, afterElement) => {
    if (!afterElement) {
        return null;
    }
    const index = plugins
        .getInitializer()
        .getElements()
        .findIndex(node => {
            return Node.isCallExpression(node) && node.getExpression().getText() === afterElement;
        });
    if (index >= 0) {
        return index;
    }
    return null;
};
/**
 *
 * @param context {CliContext}
 * @param source {tsMorph.SourceFile}
 * @param imports {{elementName: String, importPath: String, afterElement: String | undefined, isImportCallable: boolean, addToPlugins: boolean}[]}
 * @param file {String}
 */
const addImportsToSource = ({ context, source, imports, file }) => {
    const { info, warning, error } = context;
    let pluginsElement;
    const getPluginsElement = () => {
        if (pluginsElement) {
            return pluginsElement;
        }
        /**
         * We need the plugins property in the createHandler argument.
         * @type {tsMorph.Node}
         */
        pluginsElement = source.getFirstDescendant(
            node => tsMorph.Node.isPropertyAssignment(node) && node.getName() === "plugins"
        );
        if (!pluginsElement) {
            error(
                `Cannot find "plugins" property of the "createHandler" argument object in ${info.hl(
                    file
                )}.`
            );
        }
        return pluginsElement;
    };

    for (const value of imports) {
        const {
            elementName,
            importPath,
            afterElement,
            afterImport,
            isImportCallable = true,
            addToPlugins = true
        } = value;

        const importDefinition = source.getImportDeclaration(importPath);
        /**
         * If there is required import already, do not proceed.
         * We do not check if imported plugins are actually sent into the handler because we dont know what user might have done.
         */
        if (importDefinition) {
            info(`Import ${info.hl(importPath)} already exists in ${info.hl(file)}.`);
            continue;
        }
        let addedImport = false;
        /**
         * If we need to import after already defined import.
         */
        if (afterImport) {
            const afterImportDeclaration = source.getImportDeclaration(afterImport);
            if (afterImportDeclaration) {
                source.insertImportDeclaration(afterImportDeclaration.getChildIndex() + 1, {
                    defaultImport: elementName,
                    moduleSpecifier: importPath
                });
                addedImport = true;
            } else {
                warning(
                    `Import ${warning.hl(afterImport)} does not exist in ${warning.hl(
                        file
                    )}. Adding new import after the last one.`
                );
            }
        }
        /**
         * If no import was added, add it at the end.
         */
        if (addedImport === false) {
            /**
             * We add the import and after that we add the imported name to the plugins array in the createHandler.
             */
            source.addImportDeclaration({
                defaultImport: elementName,
                moduleSpecifier: importPath
            });
        }
        if (addToPlugins === false) {
            continue;
        }

        const importedElementName = `${elementName}${isImportCallable === false ? "" : "()"}`;

        const plugins = getPluginsElement();
        if (!plugins) {
            error(`Could not add ${error.hl(importedElementName)} to the plugins.`);
            continue;
        }
        /**
         * If after is specified, add the imported value after the one given in the args..
         */
        if (afterElement) {
            const afterIndex = findElementIndex(plugins, afterElement);
            if (afterIndex === null) {
                warning(
                    `Could not find ${warning.hl(
                        after
                    )} of the createHandler.plugins array in ${warning.hl(file)}.`
                );
            } else {
                plugins.getInitializer().insertElement(afterIndex + 1, importedElementName);
                continue;
            }
        }
        /**
         * Add imported plugin at the end of the array as no other options are viable.
         */
        plugins.getInitializer().addElement(importedElementName);
    }
};

/**
 * @param packageJsonPath {String}
 * @param pathsToAdd {String[]}
 */
const addWorkspaceToRootPackageJson = async (packageJsonPath, pathsToAdd) => {
    const rootPackageJson = await loadJson(packageJsonPath);

    pathsToAdd.forEach(pathToAdd => {
        // Ensure forward slashes are used.
        pathToAdd = pathToAdd.replace(/\\/g, "/");
        // Add it to workspaces packages if not already
        if (!rootPackageJson.workspaces.packages.includes(pathToAdd)) {
            rootPackageJson.workspaces.packages.push(pathToAdd);
        }
    });

    await writeJson(packageJsonPath, rootPackageJson);
};

/**
 * @param packageJsonPath {String}
 * @param pathsToRemove {String[]}
 */
const removeWorkspaceToRootPackageJson = async (packageJsonPath, pathsToRemove) => {
    const rootPackageJson = await loadJson(packageJsonPath);

    pathsToRemove.forEach(pathToRemove => {
        // Remove it from workspaces packages if present
        const index = rootPackageJson.workspaces.packages.indexOf(pathToRemove);
        if (index !== -1) {
            rootPackageJson.workspaces.packages.splice(index, 1);
        }
    });

    await writeJson(packageJsonPath, rootPackageJson);
};

module.exports = {
    insertImport,
    addPackagesToDependencies,
    addPackagesToDevDependencies,
    addPackagesToPeerDependencies,
    createMorphProject,
    prettierFormat,
    yarnInstall,
    yarnUp,
    addImportsToSource,
    addWorkspaceToRootPackageJson,
    removeWorkspaceToRootPackageJson
};
