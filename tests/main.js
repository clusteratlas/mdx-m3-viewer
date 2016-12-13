function addTestResult(testResult) {
    let div = document.createElement("div"),
        name = document.createElement("p"),
        status = document.createElement("p"),
        data = testResult[1],
        misMatchPercentage = Math.round(data.rawMisMatchPercentage),
        result = misMatchPercentage <= 1; // allow 1% mismatch

    console.log(misMatchPercentage);
    name.textContent = testResult[0] + " ";
    name.className = "item";

    status.textContent = result ? "passed" : "failed";
    status.style.color = result ? "green" : "red";
    status.className = "item";

    div.appendChild(name);
    div.appendChild(status);

    if (misMatchPercentage) {
        let mismatch = document.createElement("p");

        mismatch.className = "item";

        mismatch.appendChild(document.createTextNode(" with "));

        let span = document.createElement("span");

        span.textContent = misMatchPercentage + " percent";
        span.style.color = "red";

        mismatch.appendChild(span);
        mismatch.appendChild(document.createTextNode(" mismatch"));

        div.appendChild(mismatch);
    }

    document.body.appendChild(div);
}

document.body.appendChild(unitTester.canvas);

unitTester.run((testResult) => {
    if (!testResult.done) {
        addTestResult(testResult.value)
    }
});
