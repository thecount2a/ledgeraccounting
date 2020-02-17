var app = angular.module("routedTabs", ['ui.router', 'ui.bootstrap', 'ui.bootstrap.modal', 'ngTouch', 'ui.grid', 'ui.grid.edit', 'ui.grid.cellNav', 'ui.grid.autoScroll', 'ui.grid.pinning', 'ui.grid.selection', 'ui.grid.treeView', 'ui.grid.resizeColumns', 'ui.grid.exporter', 'ui.select']);

app.config(function($stateProvider, $urlRouterProvider){

    $urlRouterProvider.otherwise("/main/reports");

    $stateProvider
        .state("main", { abtract: true, url:"/main", templateUrl:"main.html" })
            .state("main.reports", { url: "/reports?report&time&timeperiod&accounts&historical", 
                                        templateUrl: "reports.html", controller: "reportsCtrl"})
            .state("main.editor", { url: "/editor?ledger&accounts", templateUrl: "editor.html", controller: "editorCtrl"})
            .state("main.budget", { url: "/budget?time&timeperiod&budgetperiod", 
                                        templateUrl: "budget.html", controller: "reportsCtrl"});

});

app.directive('uiSelectWrap', function($document, uiGridEditConstants) {
    return function link($scope, $elm, $attr) {
      $document.on('click', docClick);
      
      function docClick(evt) {
        if ($(evt.target).closest('.ui-select-container').size() === 0) {
          $scope.$emit(uiGridEditConstants.events.END_CELL_EDIT);
          $document.off('click', docClick);
        }
      }
    };
});

app.directive('customOnChange', function() {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.customOnChange);
      element.on('change', onChangeHandler);
      element.on('$destroy', function() {
        element.off();
      });

    }
  };
});
