// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {GenericAction} from 'mattermost-redux/types/actions';

import {updateActiveSection} from 'actions/views/settings';

import SettingItemMax from './setting_item_max';

function mapDispatchToProps(dispatch: Dispatch<GenericAction>) {
    return {
        actions: bindActionCreators({
            updateActiveSection,
        }, dispatch),
    };
}

export default connect(null, mapDispatchToProps)(SettingItemMax);
