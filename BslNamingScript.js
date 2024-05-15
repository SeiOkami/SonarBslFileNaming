// ==UserScript==
// @name         SonarBSL
// @version      0.6
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
        ['div[title$=".bsl"], span[title$=".bsl"]', getBslElementPath_ListIssues],
        ['div[title$=".bsl"] > span', getBslElementPath_NavListIssues],
        ['div[title$=".bsl"] > bdi', getBslElementPath_NavListIssues],
        ['button[data-clipboard-text$=".bsl"]', getBslElementPath_ShowIssue],
        ['td > div > a[title$=".bsl"] > span', getBslElementPath_MeasuresTable],
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
        ['CalculationRegisters', 'РегистрыРасчета'],
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
        ['Ext', ''],
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
        ['RecordSetModule.bsl', 'МодульНабораЗаписей'],
        ['ManagedApplicationModule.bsl', 'МодульУправляемогоПриложения'],
        ['OrdinaryApplicationModule.bsl', 'МодульОбычногоПриложения'],
        ['ExternalConnectionModule.bsl', 'МодульВнешнегоСоединения'],
        ['SessionModule.bsl', 'МодульСеанса'],
        ['ValueManagerModule.bsl', 'МодульМенеджераЗначений'],
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
                if (fullPath != undefined
                    && fullPath.element != undefined
                    && hasOnlyText(fullPath.element)){

                    let presentation = presentationFileOneS(fullPath.path);
                    if (presentation > "") {
                        fullPath.element.textContent = presentation;
                    };

                }

            });
        });
    }

    //Возвращает полный путь к файлу из атрибута "title"
    function getBslElementPath_ListIssues(element){
        let path = element?.getAttribute("title");
        return new BslElementPath(element, path);
    }

    //Возвращает полный путь к файлу из родителя
    function getBslElementPath_NavListIssues(element){
        let result = getBslElementPath_ListIssues(element?.parentNode);
        result.element = element;
        return result;
    }

    //Возвращает полный путь к файлу из атрибута 'data-clipboard-text' и элемент с .bsl
    function getBslElementPath_ShowIssue(element){

        var resultElement = undefined;

        let pathFile = element.getAttribute('data-clipboard-text');
        var previousElement = element.previousElementSibling;

        //Старый интерфейс. В предыдущем родителю div лежит целевой div, в котором картинка и span`ы, в которых наш путь
        //Удалим все span`ы и вернем последний, в который будет помещено новое имя
        if (previousElement == null) {
            element = element.parentElement?.previousElementSibling;
            if (element != null){
                let spans = element.querySelectorAll('span');
                if (spans.length > 0){
                    for (let i = 0; i < spans.length - 1; i++) {
                        element.removeChild(spans[i]);
                    };
                    resultElement = spans[spans.length-1];
                };
            };

        //Новый интерфейс. Возвращаем предыдущий элемент
        } else if (isBslFile(previousElement.innerText)) {
            resultElement = previousElement;
        }

        if (resultElement != undefined){
            return new BslElementPath(resultElement, pathFile);
        } else {
            return undefined;
        }
    }

    function getBslElementPath_MeasuresTable(element) {
        let parentNode = element.parentNode;
        if (parentNode !== null && isBslFile(parentNode.title)) {
            while (parentNode.firstChild) {
                parentNode.removeChild(parentNode.firstChild);
            }
            return new BslElementPath(parentNode, parentNode.title);
        }
        return undefined;
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
                if (!isRuName && baseClass !== undefined && baseClass !== '') {
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
            if (baseClass !== '') {
                newPath.unshift(baseClass);
            }

            let stringPath = newPath.join('.');
            if (!isRuName && stringPath.endsWith('.bsl')) {
                stringPath = stringPath.slice(0, -4);
            }
            return stringPath;
        }

    }

    //Объект содержит полный путь к файлу и элемент, в котором его необходимо заменить на представление 1С
    class BslElementPath{
        constructor(element, path) {
            this.element = element;
            this.path = path;
        }
    }

    //Проверяет, что элемент содержит внутри только текст (без подчиненных элементов)
    function hasOnlyText(element) {
        for (let i = 0; i < element.childNodes.length; i++) {
          if (element.childNodes[i].nodeType === 1) {
            return false;
          }
        }
        return true;
      }

})();