import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const FundifyLoginCases = () => {
    return (
        <LoginCaseScreen
            apiUrl={`/loan-booking/login-loans?table=loan_booking_fundify&prefix=FUN`}
            title="Fundify Login Stage Cases"
            tableName="loan_booking_fundify"
            lenderName="Fundify"
            showResumeButton={true}
            resumePath="/fundify-loans/manual-entry"
        />
    )
}

export default FundifyLoginCases