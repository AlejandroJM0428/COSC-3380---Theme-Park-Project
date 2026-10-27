USE theme_park;

ALTER TABLE AppUser
    MODIFY COLUMN Role
        ENUM('Admin', 'Manager', 'Cashier', 'Customer') NOT NULL,

    ADD COLUMN CustomerID INT UNSIGNED NULL
        AFTER EmployeeID,

    ADD CONSTRAINT UQ_AppUser_CustomerID
        UNIQUE (CustomerID),

    ADD CONSTRAINT FK_AppUser_CustomerID
        FOREIGN KEY (CustomerID)
        REFERENCES Customer (CustomerID)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    ADD CONSTRAINT CHK_AppUser_AccountType CHECK (
        (
            Role = 'Customer'
            AND CustomerID IS NOT NULL
            AND EmployeeID IS NULL
        )
        OR
        (
            Role IN ('Admin', 'Manager', 'Cashier')
            AND CustomerID IS NULL
        )
    );