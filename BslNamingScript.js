// ==UserScript==
// @name         SonarBSL
// @version      0.5
// @description  Скрипт для SonarQube, который изменяет отображение файлов модулей .bsl на 1Сные наименования объектов
// @match        localhost:9000/*
// @match        https://sonar.openbsl.ru/*
// @icon         https://cdn.icon-icons.com/icons2/3915/PNG/512/sonar_logo_icon_249578.png
// @author       SeiOkami
// @homepageURL  https://github.com/SeiOkami/SonarBslFileNaming/
// @supportURL   https://github.com/SeiOkami/SonarBslFileNaming/issues
// @updateURL    https://raw.githubusercontent.com/SeiOkami/SonarBslFileNaming/main/BslNamingScript.js
// @downloadURL  https://raw.githubusercontent.com/SeiOkami/SonarBslFileNaming/main/BslNamingScript.js
// ==/UserScript==

(function() {
    'use strict';

    //Определение языка для объектов 1С
    const languageVersions = {
        Eng: 'English',
        Ru: 'Russian',
        Auto: 'Auto by browser',
    };

    //Текущий язык. Можно заменить на необходимый
    let languageVersion = languageVersions.Auto;

    //Если авто, то выбираем по локали браузера
    if (languageVersion == languageVersions.Auto){
        if (navigator.language.match(/ru|be|bg|kk|mk|sr|uk/i)){
            languageVersion = languageVersions.Ru;
        } else {
            languageVersion = languageVersions.Eng;
        }
    }

    //По данным селекторам определяем элементы с именами файлов и методы получения полного имени
    const selectorFunctions = new Map([
        ['div[title$=".bsl"], span[title$=".bsl"]', fullPathFileElement_ListIssues],
        ['div[title$=".bsl"] > span', fullPathFileElement_NavListIssues],
        ['span:has(> button[data-clipboard-text$=".bsl"]) > span', fullPathFileElement_ShowIssue],
    ]);

    //Подписываемся на добавления новых элементов страницы
    const observer = new MutationObserver(processPageChanges);
    observer.observe(document.querySelector("body"), {
        attributes: false,
        childList: true,
        subtree: true
    });

    //Соответствие имен каталогов и 1Сных базовых объектов метаданных
    const mapFileBaseClass = new Map([
        ['AccountingRegisters', 'РегистрыБухгалтерии'],
        ['AccumulationRegisters', 'РегистрыНакопления'],
        ['BusinessProcesses', 'БизнесПроцессы'],
        ['Catalogs', 'Справочники'],
        ['ChartsOfAccounts', 'ПланыСчетов'],
        ['ChartsOfCalculationTypes', 'ПланыВидовРасчета'],
        ['ChartsOfCharacteristicTypes', 'ПланыВидовХарактеристик'],
        ['CommonCommands', 'ОбщиеКоманды'],
        ['CommonForms', 'ОбщиеФормы'],
        ['CommonModules', 'ОбщиеМодули'],
        ['Configuration', 'Конфигурация'],
        ['Constants', 'Константы'],
        ['DataProcessors', 'Обработки'],
        ['DocumentJournals', 'ЖурналыДокументов'],
        ['Documents', 'Документы'],
        ['Enums', 'Перечисления'],
        ['ExchangePlans', 'ПланыОбмена'],
        ['ExternalDataSources', 'ВнешниеИсточникиДанных'],
        ['HTTPServices', 'HTTPСервисы'],
        ['InformationRegisters', 'РегистрыСведений'],
        ['Reports', 'Отчеты'],
        ['SettingsStorages', 'ХранилищаНастроек'],
        ['Tasks', 'Задачи'],
        ['WebServices', 'ВебСервисы'],
        ['ExternalDataProcessors', 'ВнешниеОбработки'],
    ]);

    //Скрываемые участки пути к файлу
    const ignoredPathFile = [
        'CommandModule.bsl',
        'Forms',
        'Form',
        'Ext',
        'Module.bsl',
        'Commands',
    ];

    //Заменяемые имена в ру-1С
    const replacePathFile = new Map([
        ['ManagerModule.bsl', 'МодульМенеджера'],
        ['ObjectModule.bsl', 'МодульОбъекта'],
        ['ManagedApplicationModule.bsl', 'МодульПриложения'],
    ]);

    //Функция обрабатываем новые элементы страницы
    function processPageChanges(mutationsList, observer) {
        for (let mutation of mutationsList) {
            if (mutation.type === "childList") {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        renameBslFiles(node);
                    }
                });
            }
        }
    };

    //Если элемент соответствует селектору, то в его содержимое помещается представление объекта 1С
    function renameBslFiles(node) {
        selectorFunctions.forEach((funcGetPath, selector) => {
            const test_spans = node.querySelectorAll(selector);
            test_spans.forEach(element => {
                let fullPath = funcGetPath(element);
                let presentation = presentationFileOneS(fullPath);
                if (presentation > "") {
                    element.textContent = presentation;
                };
            });
        });
    }

    //Возвращает полный путь к файлу из атрибута "title"
    function fullPathFileElement_ListIssues(element){

        return element?.getAttribute("title");
    }

    //Возвращает полный путь к файлу из родителя
    function fullPathFileElement_NavListIssues(element){

        return fullPathFileElement_ListIssues(element?.parentNode);
    }

    //Возвращает полный путь к файлу из атрибута 'data-clipboard-text' одного из соседей
    function fullPathFileElement_ShowIssue(element){
        let thisElem = element;
        do{
            thisElem = thisElem.nextElementSibling;
            if (thisElem == undefined){
                continue;
            }

            let atribute = thisElem.getAttribute('data-clipboard-text');
            if (isBslFile(atribute)){
                return atribute;
            }

        } while (thisElem);
    }

    //Проверка является ли текущий путь к файлу 1С
    function isBslFile(pathFile){
        return pathFile != undefined && pathFile.endsWith('.bsl');
    }

    //Превращает путь к файлу 1С в его 1Сное представление
    function presentationFileOneS(fullPath){

        if (fullPath == undefined){
            return "";
        }

        let partsPath = fullPath.split('/');
        let baseClass = undefined;
        let isRuName = (languageVersion == languageVersions.Ru);
        let newPath = [];
        partsPath.forEach(partPath => {

            if (baseClass == undefined){
                baseClass = mapFileBaseClass.get(partPath);
                if (isRuName == false && baseClass != undefined){
                    baseClass = partPath;
                }
            } else if (ignoredPathFile.indexOf(partPath) == -1) {

                let thisPart = undefined;

                if (isRuName){
                    thisPart = replacePathFile.get(partPath);
                }

                if (thisPart == undefined){
                    thisPart = partPath;
                }

                newPath.push(thisPart);

            }
        });

        if (baseClass == undefined){
            return fullPath;
        } else {
            newPath.unshift(baseClass);
            return newPath.join('.');
        }

    }

})();